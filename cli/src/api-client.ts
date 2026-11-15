// Browser-safe: no node:* imports. Shared by web/src/api.ts (bundled for
// the browser) and cli/src/remote-store.ts (Node). Keep it that way.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// crypto.randomUUID() only exists in secure contexts (https://, localhost).
// Plain-HTTP LAN access (http://laptop.local:3030) is NOT a secure context on
// Safari/Chrome mobile, so we fall back to a non-crypto unique key —
// idempotency just needs to dedupe a user's double-taps across the last 100
// requests, not resist anything.
export function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') msg = body.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export interface HttpClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
  authHeaders?: () => Promise<Record<string, string>>;
}

export interface ConditionalCache<T> {
  etag?: string;
  body?: T;
}

export function createHttpClient(opts: HttpClientOptions = {}) {
  const base = opts.baseUrl ?? '';
  async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = opts.authHeaders ? await opts.authHeaders() : {};
    const res = await fetch(base + path, {
      credentials: opts.credentials,
      ...init,
      headers: { 'Content-Type': 'application/json', ...auth, ...(init.headers ?? {}) },
    });
    return unwrap<T>(res);
  }

  /**
   * Conditional GET. Sends If-None-Match from `cache` and, on a 304, returns
   * the cached body without re-downloading it; otherwise parses the response
   * and refreshes the cache (when the server sent an ETag). Used for the
   * poll-heavy full-list read, where "nothing changed" is the common answer.
   */
  async function reqCached<T>(path: string, cache: ConditionalCache<T>, init: RequestInit = {}): Promise<T> {
    const auth = opts.authHeaders ? await opts.authHeaders() : {};
    const conditional: Record<string, string> =
      cache.etag !== undefined && cache.body !== undefined ? { 'If-None-Match': cache.etag } : {};
    const res = await fetch(base + path, {
      credentials: opts.credentials,
      ...init,
      headers: { 'Content-Type': 'application/json', ...auth, ...conditional, ...(init.headers ?? {}) },
    });
    if (res.status === 304 && cache.body !== undefined) return cache.body;
    const body = await unwrap<T>(res);
    const etag = res.headers.get('ETag');
    if (etag) {
      cache.etag = etag;
      cache.body = body;
    }
    return body;
  }
  return { req, reqCached, idempotencyKey };
}
