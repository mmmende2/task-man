import type { Task } from './types';
import type { MetricsResponse } from 'task-man/types';

export type { MetricsResponse };

// All requests are same-origin (Vite proxies /api in dev; the Hono
// server serves the SPA + API together in prod), so a cookie set by
// /api/auth/login rides along automatically. We still pass
// credentials: 'include' for safety in case the SPA is ever loaded
// from a non-matching origin.

const baseInit: RequestInit = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
};

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
function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function unwrap<T>(res: Response): Promise<T> {
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

export const api = {
  async login(pin: string): Promise<void> {
    await unwrap(await fetch('/api/auth/login', { ...baseInit, method: 'POST', body: JSON.stringify({ pin }) }));
  },
  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { ...baseInit, method: 'POST' });
  },
  async session(): Promise<boolean> {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return res.ok;
  },
  async listCategories(): Promise<{ name: string; count: number }[]> {
    return unwrap(await fetch('/api/categories', { credentials: 'include' }));
  },
  async listTasks(params: Record<string, string | undefined> = {}): Promise<Task[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    return unwrap<Task[]>(await fetch(`/api/tasks?${qs}`, { credentials: 'include' }));
  },
  async createTask(input: Record<string, unknown>, key: string = idempotencyKey()): Promise<Task> {
    return unwrap<Task>(
      await fetch('/api/tasks', {
        ...baseInit,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(input),
      }),
    );
  },
  async patchTask(id: string, patch: Record<string, unknown>): Promise<Task> {
    return unwrap<Task>(await fetch(`/api/tasks/${id}`, { ...baseInit, method: 'PATCH', body: JSON.stringify(patch) }));
  },
  async complete(id: string): Promise<Task> {
    return unwrap<Task>(await fetch(`/api/tasks/${id}/complete`, { ...baseInit, method: 'POST' }));
  },
  async unfocus(id: string): Promise<Task> {
    return unwrap<Task>(await fetch(`/api/tasks/${id}/unfocus`, { ...baseInit, method: 'POST' }));
  },
  async getMetrics(date?: string): Promise<MetricsResponse> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return unwrap<MetricsResponse>(await fetch(`/api/metrics${qs}`, { credentials: 'include' }));
  },
};
