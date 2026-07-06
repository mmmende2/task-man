import type { Task } from './types';
import type { MetricsResponse } from 'task-man/types';
import { createHttpClient, idempotencyKey } from 'task-man/api-client';

export type { MetricsResponse };
export { ApiError } from 'task-man/api-client';

// All requests are same-origin — Vite proxies /api in dev, and the Hono
// server serves the SPA + API together in prod. In production, Cloudflare
// Access gates the whole hostname (see docs/deploy-plan.md); this app has
// no auth of its own.
const client = createHttpClient({ baseUrl: '', credentials: 'include' });

// 401 means the Cloudflare Access session expired (or origin JWT
// verification rejected us). There is no in-app login — the PIN flow is
// gone — so the recovery is a full page load, which lets Access run its
// redirect-to-login dance on the document request. Guarded to once per
// page load: if the reload comes back still 401ing (misconfigured
// deploy), we must not reload-loop; pages fall back to their error UI.
let reloadedForAuth = false;
export function reloadForAuth(): void {
  if (reloadedForAuth) return;
  reloadedForAuth = true;
  window.location.reload();
}

export const api = {
  async listCategories(): Promise<{ name: string; count: number }[]> {
    return client.req('/api/categories');
  },
  async listTasks(params: Record<string, string | undefined> = {}): Promise<Task[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    return client.req<Task[]>(`/api/tasks?${qs}`);
  },
  async createTask(input: Record<string, unknown>, key: string = idempotencyKey()): Promise<Task> {
    return client.req<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(input),
    });
  },
  async patchTask(id: string, patch: Record<string, unknown>): Promise<Task> {
    return client.req<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  async deleteTask(id: string): Promise<void> {
    await client.req(`/api/tasks/${id}`, { method: 'DELETE' });
  },
  async complete(id: string): Promise<Task> {
    return client.req<Task>(`/api/tasks/${id}/complete`, { method: 'POST' });
  },
  async unfocus(id: string): Promise<Task> {
    return client.req<Task>(`/api/tasks/${id}/unfocus`, { method: 'POST' });
  },
  async getMetrics(date?: string, scope?: 'personal' | 'professional'): Promise<MetricsResponse> {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (scope) qs.set('scope', scope);
    const s = qs.toString();
    return client.req<MetricsResponse>(`/api/metrics${s ? `?${s}` : ''}`);
  },
  // Unauthenticated on the origin (see routes.ts), so this reflects the
  // deployed server version — the source of truth for "what's live".
  async getHealth(): Promise<HealthResponse> {
    return client.req<HealthResponse>('/healthz');
  },
};

export interface HealthResponse {
  ok: boolean;
  version: string;
  time: string;
}
