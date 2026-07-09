import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHttpClient, idempotencyKey } from './api-client.js';
import { resolveCloudflared } from './cloudflared.js';
import { applyFilter, completedOn, createdOn, inProgressUpdatedOn, resolvePrefix } from './task-filters.js';
import type { Store, TaskChanges } from './store-interface.js';
import type { CreateTaskInput, Task, TaskFilter, TaskManConfig } from './types.js';

const execFileAsync = promisify(execFile);

// The header cloudflared's own `access curl` helper sends for a token
// obtained via `cloudflared access token` — kept as one constant so it's
// trivially switchable if the live Access app disagrees (see
// docs/phase1-technical-plan.md §12.3).
const CF_ACCESS_TOKEN_HEADER = 'cf-access-token';

// `forceRefresh` lets RemoteStore ask for a non-cached token after a
// 401/403 — without it, a retry would just resend the same stale token.
export type AuthHeadersProvider = (forceRefresh?: boolean) => Promise<Record<string, string>>;

// Cloudflare Access service token: non-expiring, for headless MCP (no
// interactive login available). No caching, nothing to refresh.
export function serviceTokenAuth(clientId: string, clientSecret: string): AuthHeadersProvider {
  return async () => ({
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  });
}

// Interactive `cloudflared access login` JWT flow, for the TUI. Caches
// the token until shortly before it expires.
export function cloudflaredJwtAuth(baseUrl: string, cloudflaredPath?: string): AuthHeadersProvider {
  let cached: { token: string; expiresAt: number } | null = null;

  async function fetchToken(): Promise<string> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(resolveCloudflared(cloudflaredPath), ['access', 'token', '--app', baseUrl]));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error("cloudflared not found. Install it (brew install cloudflared) and run 'task-man login'.");
      }
      throw new Error(`Not authenticated to ${baseUrl}. Run 'task-man login'.`);
    }
    const token = stdout.trim();
    if (!token) {
      throw new Error(`Not authenticated to ${baseUrl}. Run 'task-man login'.`);
    }
    return token;
  }

  function expiryOf(token: string): number {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
      if (typeof payload.exp === 'number') return payload.exp * 1000 - 60_000;
    } catch {
      /* fall through to conservative default */
    }
    return Date.now() + 10 * 60_000;
  }

  return async (forceRefresh = false) => {
    if (forceRefresh || !cached || Date.now() >= cached.expiresAt) {
      const token = await fetchToken();
      cached = { token, expiresAt: expiryOf(token) };
    }
    return { [CF_ACCESS_TOKEN_HEADER]: cached.token };
  };
}

// Picks the service token (headless, e.g. MCP) when configured, else falls
// back to the interactive cloudflared JWT flow (TUI). Shared by get-store.ts
// and useServerStatus.ts so the two auth paths can't drift.
export function authFromConfig(client: NonNullable<TaskManConfig['client']>): AuthHeadersProvider {
  const { remote_url, service_token_id, service_token_secret, cloudflared_path } = client;
  return service_token_id && service_token_secret
    ? serviceTokenAuth(service_token_id, service_token_secret)
    : cloudflaredJwtAuth(remote_url!, cloudflared_path);
}

export interface RemoteStoreOptions {
  authHeaders?: AuthHeadersProvider;
}

export class RemoteStore implements Store {
  private client: ReturnType<typeof createHttpClient>;
  private authHeaders: AuthHeadersProvider;
  private baseUrl: string;

  constructor(baseUrl: string, opts: RemoteStoreOptions = {}) {
    this.baseUrl = baseUrl;
    this.authHeaders = opts.authHeaders ?? cloudflaredJwtAuth(baseUrl);
    this.client = createHttpClient({ baseUrl });
  }

  private async req<T>(
    path: string,
    init: RequestInit = {},
    retried: { auth?: boolean; network?: boolean } = {},
  ): Promise<T> {
    const auth = await this.authHeaders(retried.auth);
    try {
      return await this.client.req<T>(path, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        if (retried.auth) {
          // Already retried once with a forced-fresh token — give up clearly.
          throw new Error(`Access denied for ${this.baseUrl}. Run 'task-man login' (your session may have expired).`);
        }
        return this.req<T>(path, init, { ...retried, auth: true });
      }
      // Cloudflare fronts the origin, so while the droplet container is
      // restarting (a deploy) the edge answers 502/503/504 for a few
      // seconds. Treat it like a network blip: pause, retry once, and if
      // it persists throw a clean actionable error instead of letting a
      // gateway hiccup surface as a crash. Retries replay the same
      // Idempotency-Key, so writes can't double-apply.
      if (status === 502 || status === 503 || status === 504) {
        if (retried.network) {
          throw new Error(
            `${this.baseUrl} is unreachable (HTTP ${status}) — the server may be restarting. Try again in a moment.`,
          );
        }
        await new Promise((r) => setTimeout(r, 1500));
        return this.req<T>(path, init, { ...retried, network: true });
      }
      if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure (DNS, refused, offline).
        if (retried.network) {
          throw new Error(`Cannot reach ${this.baseUrl}. Check your connection.`);
        }
        return this.req<T>(path, init, { ...retried, network: true });
      }
      throw err;
    }
  }

  async load(): Promise<Task[]> {
    return this.req<Task[]>('/api/store/tasks');
  }

  async query(filter: TaskFilter = {}): Promise<Task[]> {
    return applyFilter(await this.load(), filter);
  }

  async resolveId(prefix: string): Promise<string> {
    return resolvePrefix(await this.load(), prefix);
  }

  async getCompletedOn(date: string): Promise<Task[]> {
    return completedOn(await this.load(), date);
  }

  async getCreatedOn(date: string): Promise<Task[]> {
    return createdOn(await this.load(), date);
  }

  async getInProgressUpdatedOn(date: string): Promise<Task[]> {
    return inProgressUpdatedOn(await this.load(), date);
  }

  async add(input: CreateTaskInput): Promise<Task> {
    // Generated once here (not per-attempt) so a retry inside req() replays
    // the same key and the server's idempotency cache can dedupe it.
    return this.req<Task>('/api/store/add', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ input }),
    });
  }

  async update(id: string, changes: TaskChanges): Promise<Task> {
    // Keyed like add/insertAt: a retry after a lost response must replay
    // the cached result, not re-run (or 404) the operation.
    return this.req<Task>('/api/store/update', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ id, changes }),
    });
  }

  async remove(id: string): Promise<{ task: Task; index: number }> {
    return this.req('/api/store/remove', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ id }),
    });
  }

  async insertAt(task: Task, index: number): Promise<Task> {
    return this.req<Task>('/api/store/insertAt', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ task, index }),
    });
  }

  // Used by useServerStatus in remote mode — a bare fetch would return
  // Cloudflare Access's login HTML (HTTP 200) for an unauthenticated
  // request, so the ping must carry auth headers same as any other call.
  async ping(): Promise<boolean> {
    try {
      const res = await this.req<{ ok: boolean }>('/healthz');
      return res.ok === true;
    } catch {
      return false;
    }
  }
}
