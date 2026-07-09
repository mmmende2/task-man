import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { LocalStore } from '../local-store.js';
import { createApp } from '../server/routes.js';
import { scopeStore } from '../server/scoped-store.js';
import { TaskStore } from '../store.js';

// The /mcp endpoint speaks MCP streamable HTTP (stateless, JSON responses).
// These tests drive it with raw JSON-RPC the way a remote MCP client would.
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

type App = ReturnType<typeof createApp>;

let rpcId = 1;

async function rpc(app: App, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.error, JSON.stringify(body.error)).toBeUndefined();
  return body.result;
}

const initialize = (app: App) =>
  rpc(app, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' },
  });

const callTool = (app: App, name: string, args: Record<string, unknown> = {}) =>
  rpc(app, 'tools/call', { name, arguments: args });

describe('/mcp streamable HTTP endpoint', () => {
  let tmpDir: string;
  let store: LocalStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-mcp-'));
    store = new LocalStore(new TaskStore(join(tmpDir, 'tasks.json')));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('answers initialize with server info', async () => {
    const app = createApp({ store });
    const result = await initialize(app);
    expect(result.serverInfo.name).toBe('task-man');
  });

  it('lists tools, without the stdio-only task_session_color', async () => {
    const app = createApp({ store });
    const { tools } = await rpc(app, 'tools/list');
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain('task_stats');
    expect(names).toContain('task_whoami');
    expect(names).not.toContain('task_session_color');
  });

  it('round-trips a task through tools/call', async () => {
    const app = createApp({ store });
    await callTool(app, 'task_add', { title: 'From remote MCP' });
    const stats = await callTool(app, 'task_stats');
    expect(JSON.parse(stats.content[0].text).backlog).toBeGreaterThanOrEqual(0);
    expect(await store.load()).toHaveLength(1);
    expect((await store.load())[0].title).toBe('From remote MCP');
  });

  it('task_refine_queue returns { total, queue } and honors scope', async () => {
    const app = createApp({ store });
    // A professional and a personal task, each needing refinement (no vibe).
    await callTool(app, 'task_add', { title: 'Work item', scope: 'professional' });
    await callTool(app, 'task_add', { title: 'Home item', scope: 'personal' });

    const all = JSON.parse((await callTool(app, 'task_refine_queue')).content[0].text);
    expect(all).toHaveProperty('total');
    expect(all).toHaveProperty('queue');
    expect(all.total).toBe(2);
    expect(all.queue).toHaveLength(2);

    const pro = JSON.parse(
      (await callTool(app, 'task_refine_queue', { scope: 'professional' })).content[0].text,
    );
    expect(pro.total).toBe(1);
    expect(pro.queue).toHaveLength(1);
    expect(pro.queue[0].task.title).toBe('Work item');
  });

  it('task_categories honors scope', async () => {
    const app = createApp({ store });
    await callTool(app, 'task_add', { title: 'Work', scope: 'professional', categories: ['work'] });
    await callTool(app, 'task_add', { title: 'Home', scope: 'personal', categories: ['home'] });

    const pro = JSON.parse(
      (await callTool(app, 'task_categories', { scope: 'professional' })).content[0].text,
    );
    expect(pro).toEqual([{ name: 'work', count: 1 }]);
  });

  it('rejects GET and DELETE (stateless mode has no session stream)', async () => {
    const app = createApp({ store });
    expect((await app.request('/mcp')).status).toBe(405);
    expect((await app.request('/mcp', { method: 'DELETE' })).status).toBe(405);
  });

  describe('with a verified identity', () => {
    // Stands in for access-auth.ts, which is fully covered by its own tests.
    const stubAuth: MiddlewareHandler = async (c, next) => {
      c.set('accessIdentity', 'mario@test.com');
      await next();
    };

    it('scopes tools to the identity and stamps ownership on writes', async () => {
      const app = createApp({ store, accessAuth: stubAuth });
      await scopeStore(store, 'other@test.com').add({ title: 'Not yours' });

      await callTool(app, 'task_add', { title: 'Mine' });
      const list = await callTool(app, 'task_list', {});
      expect(list.content[0].text).toContain('Found 1 tasks');
      expect(list.content[0].text).toContain('Mine');
      expect(list.content[0].text).not.toContain('Not yours');

      const all = await store.load();
      expect(all.find((t) => t.title === 'Mine')?.owner).toBe('mario@test.com');
    });

    it('task_whoami reports the identity and server mode', async () => {
      const app = createApp({ store, accessAuth: stubAuth });
      const result = await callTool(app, 'task_whoami');
      const info = JSON.parse(result.content[0].text);
      expect(info.mode).toBe('server');
      expect(info.identity).toBe('mario@test.com');
    });

    it('GET /api/whoami reports the identity', async () => {
      const app = createApp({ store, accessAuth: stubAuth });
      const res = await app.request('/api/whoami');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ identity: 'mario@test.com' });
    });
  });
});
