import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { createApp } from '../server/routes.js';
import { RemoteStore } from '../remote-store.js';
import { ApiError } from '../api-client.js';
import { localDateString } from '../local-date.js';

describe('RemoteStore (against a real in-process server)', () => {
  let tmpDir: string;
  let server: ServerType;
  let baseUrl: string;
  let remote: RemoteStore;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-remote-'));
    const store = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
    const app = createApp({ store });

    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(info.port));
    });
    baseUrl = `http://localhost:${port}`;
    // No cloudflared in the test environment — stub auth entirely.
    remote = new RemoteStore(baseUrl, { authHeaders: async () => ({}) });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add faithfully persists created_by and session_id (no re-attribution to human)', async () => {
    const task = await remote.add({ title: 'MCP task', created_by: 'claude', session_id: 'sess-1' });
    expect(task.created_by).toBe('claude');
    expect(task.session_id).toBe('sess-1');
  });

  it('update / remove / insertAt round-trip', async () => {
    const added = await remote.add({ title: 'Round trip' });

    const updated = await remote.update(added.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');

    const { task: removed } = await remote.remove(added.id);
    expect(removed.id).toBe(added.id);
    expect(await remote.load()).toHaveLength(0);

    const inserted = await remote.insertAt(removed, 0);
    expect(inserted.id).toBe(added.id);
    expect(await remote.load()).toHaveLength(1);
  });

  it('query/resolveId/getCompletedOn derive correctly from load()', async () => {
    const a = await remote.add({ title: 'Focused', focused: true });
    await remote.add({ title: 'Backlog', focused: false });
    await remote.update(a.id, { status: 'done' });

    const focused = await remote.query({ focused: true });
    expect(focused.map((t) => t.title)).toEqual(['Focused']);

    const resolved = await remote.resolveId(a.id.slice(0, 8));
    expect(resolved).toBe(a.id);

    const today = localDateString();
    const completedToday = await remote.getCompletedOn(today);
    expect(completedToday.map((t) => t.title)).toEqual(['Focused']);
  });

  it('maps a resolveId miss to the same error the local store throws', async () => {
    await expect(remote.resolveId('nonexistent')).rejects.toThrow(/No task found/);
  });

  it('surfaces server validation errors as ApiError', async () => {
    await expect(remote.update('nonexistent', { status: 'done' })).rejects.toBeInstanceOf(ApiError);
  });

  it('retries once on a transient network failure', async () => {
    const added = await remote.add({ title: 'Retry me' });

    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      calls++;
      if (calls === 1) return Promise.reject(new TypeError('fetch failed'));
      return realFetch(...args);
    }) as typeof fetch;

    try {
      const result = await remote.query({ focused: true });
      expect(result).toEqual([]);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = realFetch;
    }

    void added;
  });
});
