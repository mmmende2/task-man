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
  async complete(id: string): Promise<Task> {
    return client.req<Task>(`/api/tasks/${id}/complete`, { method: 'POST' });
  },
  async unfocus(id: string): Promise<Task> {
    return client.req<Task>(`/api/tasks/${id}/unfocus`, { method: 'POST' });
  },
  async getMetrics(date?: string): Promise<MetricsResponse> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return client.req<MetricsResponse>(`/api/metrics${qs}`);
  },
};
