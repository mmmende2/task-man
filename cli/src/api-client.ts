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
  return { req, idempotencyKey };
}
