import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Hono } from 'hono';
import { TaskStore } from '../store.js';
import { createApp } from '../server/routes.js';

const PIN = '4242';
const SECRET = 'test-secret-please-ignore';

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0]; // name=value
}

async function login(app: Hono, pin = PIN): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  expect(res.status).toBe(200);
  return extractCookie(res);
}

describe('server', () => {
  let tmpDir: string;
  let store: TaskStore;
  let app: Hono;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-server-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    app = createApp({ store, pin: PIN, sessionSecret: SECRET });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('healthz is open', async () => {
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects unauthenticated API requests with 401', async () => {
    const res = await app.request('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('rejects a bad PIN', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    });
    expect(res.status).toBe(401);
  });

  it('issues a cookie on valid PIN and authorizes subsequent requests', async () => {
    const cookie = await login(app);
    expect(cookie).toContain('task-man-session=');

    const res = await app.request('/api/tasks', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('rate-limits after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      });
      expect(res.status).toBe(401);
    }
    // 6th attempt is blocked outright
    const blocked = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('creates a task (created_by human) and lists it', async () => {
    const cookie = await login(app);
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'From phone', priority: 'high' }),
    });
    expect(res.status).toBe(201);
    const task = (await res.json()) as { id: string; created_by: string; priority: string };
    expect(task.created_by).toBe('human');
    expect(task.priority).toBe('high');

    const list = await app.request('/api/tasks', { headers: { Cookie: cookie } });
    expect((await list.json()) as unknown[]).toHaveLength(1);
  });

  it('idempotency key replay returns the same task without duplicating', async () => {
    const cookie = await login(app);
    const headers = {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'Idempotency-Key': 'abc-123',
    };
    const body = JSON.stringify({ title: 'Double tapped' });

    const first = await app.request('/api/tasks', { method: 'POST', headers, body });
    const second = await app.request('/api/tasks', { method: 'POST', headers, body });
    const t1 = (await first.json()) as { id: string };
    const t2 = (await second.json()) as { id: string };
    expect(t1.id).toBe(t2.id);

    const list = await app.request('/api/tasks', { headers: { Cookie: cookie } });
    expect((await list.json()) as unknown[]).toHaveLength(1);
  });

  it('completes a top-level task from the web (no MCP guard)', async () => {
    const cookie = await login(app);
    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Headline task' }),
    });
    const task = (await created.json()) as { id: string };

    const done = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(done.status).toBe(200);
    expect((await done.json()) as { status: string }).toMatchObject({ status: 'done' });
  });

  it('focused filter + focus sort serves the Focus view', async () => {
    const cookie = await login(app);
    const mk = (title: string, priority: string, focused: boolean) =>
      app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ title, priority, focused }),
      });
    await mk('low focus', 'low', true);
    await mk('high focus', 'high', true);
    await mk('backlog', 'high', false);

    const res = await app.request('/api/tasks?focused=true&sort=focus', { headers: { Cookie: cookie } });
    const titles = ((await res.json()) as { title: string }[]).map((t) => t.title);
    expect(titles).toEqual(['high focus', 'low focus']);
  });

  it('returns 404 for an unknown task id', async () => {
    const cookie = await login(app);
    const res = await app.request('/api/tasks/does-not-exist', { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });
});
