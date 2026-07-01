import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Store } from '../store-interface.js';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  completeTask,
  focusTask,
  unfocusTask,
  searchTasks,
  getStats,
  getCategories,
  type SortKey,
} from '../handlers/index.js';
import { buildMetrics } from '../handlers/metrics.js';
import type { TaskScope, TaskStatus } from '../types.js';
import { localDateString } from '../local-date.js';

export interface ServerDeps {
  store: Store;
}

// ── Idempotency (in-memory LRU of the last 100 keys) ────────
// Phone double-taps and flaky cellular shouldn't create duplicates.
const IDEMPOTENCY_MAX = 100;

function makeIdempotencyCache() {
  const cache = new Map<string, { status: ContentfulStatusCode; body: unknown }>();
  return {
    get: (key: string) => cache.get(key),
    set: (key: string, value: { status: ContentfulStatusCode; body: unknown }) => {
      cache.set(key, value);
      if (cache.size > IDEMPOTENCY_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    },
  };
}

const boolParam = (v: string | undefined): boolean | undefined =>
  v === undefined ? undefined : v === 'true' || v === '1';

export function createApp(deps: ServerDeps): Hono {
  const { store } = deps;
  const idempotency = makeIdempotencyCache();
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ ok: true }));

  // Translate thrown store errors into sensible HTTP status codes.
  app.onError((err, c) => {
    const msg = err.message || 'error';
    if (/No task found/i.test(msg)) return c.json({ error: msg }, 404);
    if (/Multiple tasks match|its own parent/i.test(msg)) return c.json({ error: msg }, 400);
    return c.json({ error: msg }, 500);
  });

  // Stub kept for the web's "am I logged in?" poll on load. In production
  // Cloudflare Access is the only gate; in local dev, binding to 127.0.0.1
  // is the gate. No PIN, no session cookie — see docs/deploy-plan.md 1a.
  app.get('/api/auth/session', (c) => c.json({ authenticated: true }));

  // ── Store routes (faithful primitives) ────────────────────
  // Unlike /api/tasks below, these pass CreateTaskInput straight through —
  // no created_by override — so RemoteStore.add() faithfully persists
  // MCP-attributed tasks (created_by: 'claude', session_id) instead of
  // silently re-attributing them to 'human'.
  app.get('/api/store/tasks', async (c) => c.json(await store.load()));

  app.post('/api/store/add', async (c) => {
    const key = c.req.header('Idempotency-Key');
    if (key) {
      const cached = idempotency.get(key);
      if (cached) return c.json(cached.body, cached.status);
    }
    const { input } = await c.req.json();
    const task = await store.add(input);
    if (key) idempotency.set(key, { status: 201, body: task });
    return c.json(task, 201);
  });

  app.post('/api/store/update', async (c) => {
    const { id, changes } = await c.req.json();
    return c.json(await store.update(id, changes));
  });

  app.post('/api/store/remove', async (c) => {
    const { id } = await c.req.json();
    return c.json(await store.remove(id));
  });

  app.post('/api/store/insertAt', async (c) => {
    const key = c.req.header('Idempotency-Key');
    if (key) {
      const cached = idempotency.get(key);
      if (cached) return c.json(cached.body, cached.status);
    }
    const { task, index } = await c.req.json();
    const inserted = await store.insertAt(task, index);
    if (key) idempotency.set(key, { status: 201, body: inserted });
    return c.json(inserted, 201);
  });

  // ── Task routes ──────────────────────────────────────────
  app.get('/api/tasks', async (c) => {
    const q = c.req.query();
    const tasks = await listTasks(store, {
      scope: q.scope as TaskScope | undefined,
      status: q.status as TaskStatus | undefined,
      focused: boolParam(q.focused),
      category: q.category,
      parent_id: q.parent_id,
      include_done: boolParam(q.include_done),
      sort: q.sort as SortKey | undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return c.json(tasks);
  });

  app.get('/api/search', async (c) => {
    const q = c.req.query();
    const query = q.q ?? q.query ?? '';
    const matches = await searchTasks(store, {
      query,
      scope: q.scope as TaskScope | undefined,
      status: q.status as TaskStatus | undefined,
      include_done: boolParam(q.include_done),
    });
    return c.json(matches);
  });

  app.get('/api/stats', async (c) => c.json(await getStats(store)));

  app.get('/api/metrics', async (c) => {
    const date = c.req.query('date') ?? localDateString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'invalid date' }, 400);
    }
    return c.json(await buildMetrics(store, date));
  });

  app.get('/api/categories', async (c) => c.json(await getCategories(store)));

  app.get('/api/tasks/:id', async (c) => {
    const result = await getTask(store, c.req.param('id'));
    if (!result) return c.json({ error: 'not found' }, 404);
    return c.json({ ...result.task, subtasks: result.subtasks });
  });

  app.post('/api/tasks', async (c) => {
    const key = c.req.header('Idempotency-Key');
    if (key) {
      const cached = idempotency.get(key);
      if (cached) return c.json(cached.body, cached.status);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const task = await createTask(store, {
      title: String(body.title ?? ''),
      priority: body.priority as never,
      scope: body.scope as never,
      categories: body.categories as string[] | undefined,
      parent_id: body.parent_id as string | undefined,
      description: body.description as string | undefined,
      focused: body.focused as boolean | undefined,
      time_estimate: body.time_estimate as never,
      vibe: body.vibe as never,
      // The web user is Mario, not Claude. No Claude session to attribute.
      created_by: 'human',
      session_id: null,
    });
    if (key) idempotency.set(key, { status: 201, body: task });
    return c.json(task, 201);
  });

  app.patch('/api/tasks/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    // No top-level-completion guard here — on the web the user IS Mario.
    // `id` is pinned LAST so a request body cannot redirect the patch to
    // a different task by sneaking an `id` field through the spread.
    const task = await updateTask(store, { ...body, id: c.req.param('id') });
    return c.json(task);
  });

  app.delete('/api/tasks/:id', async (c) => {
    const result = await deleteTask(store, c.req.param('id'));
    return c.json(result);
  });

  app.post('/api/tasks/:id/complete', async (c) => {
    const task = await completeTask(store, c.req.param('id'));
    return c.json(task);
  });

  app.post('/api/tasks/:id/focus', async (c) => {
    const task = await focusTask(store, c.req.param('id'));
    return c.json(task);
  });

  app.post('/api/tasks/:id/unfocus', async (c) => {
    const task = await unfocusTask(store, c.req.param('id'));
    return c.json(task);
  });

  return app;
}
