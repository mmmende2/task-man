import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Hono } from 'hono';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import type { Store } from '../store-interface.js';
import { createApp } from '../server/routes.js';

describe('server', () => {
  let tmpDir: string;
  let store: Store;
  let app: Hono;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-server-'));
    store = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
    app = createApp({ store });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('healthz is open', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('creates a task (created_by human) and lists it', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'From phone', priority: 'high' }),
    });
    expect(res.status).toBe(201);
    const task = (await res.json()) as { id: string; created_by: string; priority: string };
    expect(task.created_by).toBe('human');
    expect(task.priority).toBe('high');

    const list = await app.request('/api/tasks');
    expect((await list.json()) as unknown[]).toHaveLength(1);
  });

  it('idempotency key replay returns the same task without duplicating', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'abc-123',
    };
    const body = JSON.stringify({ title: 'Double tapped' });

    const first = await app.request('/api/tasks', { method: 'POST', headers, body });
    const second = await app.request('/api/tasks', { method: 'POST', headers, body });
    const t1 = (await first.json()) as { id: string };
    const t2 = (await second.json()) as { id: string };
    expect(t1.id).toBe(t2.id);

    const list = await app.request('/api/tasks');
    expect((await list.json()) as unknown[]).toHaveLength(1);
  });

  it('completes a top-level task from the web (no MCP guard)', async () => {
    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Headline task' }),
    });
    const task = (await created.json()) as { id: string };

    const done = await app.request(`/api/tasks/${task.id}/complete`, { method: 'POST' });
    expect(done.status).toBe(200);
    expect((await done.json()) as { status: string }).toMatchObject({ status: 'done' });
  });

  it('focused filter + focus sort serves the Focus view', async () => {
    const mk = (title: string, priority: string, focused: boolean) =>
      app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, focused }),
      });
    await mk('low focus', 'low', true);
    await mk('high focus', 'high', true);
    await mk('backlog', 'high', false);

    const res = await app.request('/api/tasks?focused=true&sort=focus');
    const titles = ((await res.json()) as { title: string }[]).map((t) => t.title);
    expect(titles).toEqual(['high focus', 'low focus']);
  });

  it('returns 404 for an unknown task id', async () => {
    const res = await app.request('/api/tasks/does-not-exist');
    expect(res.status).toBe(404);
  });

  describe('/api/store/* (faithful primitives for RemoteStore)', () => {
    it('add faithfully persists created_by and session_id (no re-attribution to human)', async () => {
      const res = await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'MCP task', created_by: 'claude', session_id: 'sess-1' } }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as { created_by: string; session_id: string };
      expect(task.created_by).toBe('claude');
      expect(task.session_id).toBe('sess-1');
    });

    it('add replays idempotency key without duplicating', async () => {
      const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'store-add-1' };
      const body = JSON.stringify({ input: { title: 'Once only' } });

      const first = await app.request('/api/store/add', { method: 'POST', headers, body });
      const second = await app.request('/api/store/add', { method: 'POST', headers, body });
      const t1 = (await first.json()) as { id: string };
      const t2 = (await second.json()) as { id: string };
      expect(t1.id).toBe(t2.id);

      const list = await app.request('/api/store/tasks');
      expect((await list.json()) as unknown[]).toHaveLength(1);
    });

    it('update round-trips a change', async () => {
      const added = await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'To update' } }),
      });
      const task = (await added.json()) as { id: string };

      const res = await app.request('/api/store/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, changes: { status: 'in_progress' } }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()) as { status: string }).toMatchObject({ status: 'in_progress' });
    });

    it('remove round-trips and removes the task', async () => {
      const added = await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'To remove' } }),
      });
      const task = (await added.json()) as { id: string };

      const res = await app.request('/api/store/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { task: { id: string }; index: number };
      expect(body.task.id).toBe(task.id);

      const list = await app.request('/api/store/tasks');
      expect((await list.json()) as unknown[]).toHaveLength(0);
    });

    it('insertAt round-trips and replays idempotency key without duplicating', async () => {
      const added = await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'Original' } }),
      });
      const task = (await added.json()) as Record<string, unknown>;

      const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'store-insert-1' };
      const body = JSON.stringify({ task: { ...task, title: 'Reinserted' }, index: 0 });

      const first = await app.request('/api/store/insertAt', { method: 'POST', headers, body });
      const second = await app.request('/api/store/insertAt', { method: 'POST', headers, body });
      expect(first.status).toBe(201);
      const t1 = (await first.json()) as { id: string; title: string };
      const t2 = (await second.json()) as { id: string; title: string };
      expect(t2).toEqual(t1);

      // Original 'Original' task is still present (insertAt adds, it doesn't replace)
      const list = (await (await app.request('/api/store/tasks')).json()) as { title: string }[];
      expect(list.map((t) => t.title).sort()).toEqual(['Original', 'Reinserted']);
    });

    it('GET /api/store/tasks returns raw insertion order (no sort applied)', async () => {
      await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'First' } }),
      });
      await app.request('/api/store/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { title: 'Second' } }),
      });

      const list = (await (await app.request('/api/store/tasks')).json()) as { title: string }[];
      expect(list.map((t) => t.title)).toEqual(['First', 'Second']);
    });
  });
});
