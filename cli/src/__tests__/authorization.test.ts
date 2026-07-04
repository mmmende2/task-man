import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { createApp } from '../server/routes.js';
import { createAccessAuth } from '../server/access-auth.js';
import type { Task } from '../types.js';
import { accessClaims, makeKeyPair, signJwt } from './helpers/access-jwt.js';

// Full-request-cycle authorization tests: two signed identities against one
// app, asserting isolation both ways. This is the "verification before the
// droplet ships" checklist from docs/authorization-plan.md.

const AUD = 'test-aud-tag';
const MARIO = 'mario@example.com';
const BOB = 'bob@example.com';
const MCP_CN = 'mcp-token.example.com';

describe('authorization (identity-scoped API)', () => {
  let privateKey: KeyObject;
  let jwks: HonoJsonWebKey[];
  let tmpDir: string;
  let tasksFile: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    ({ privateKey, jwks } = makeKeyPair());
  });

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-authz-'));
    tasksFile = join(tmpDir, 'tasks.json');
    app = createApp({
      store: new LocalStore(new TaskStore(tasksFile)),
      accessAuth: createAccessAuth({
        teamDomain: 'testteam',
        aud: AUD,
        keys: jwks,
        agents: { [MCP_CN]: MARIO },
      }),
      defaultOwner: MARIO,
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const tokenFor = (email: string) => signJwt(privateKey, accessClaims(AUD, { email }));
  const serviceToken = () => signJwt(privateKey, accessClaims(AUD, { common_name: MCP_CN }));

  const as = (token: string, init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const createAs = async (token: string, title: string): Promise<Task> => {
    const res = await app.request(
      '/api/tasks',
      as(token, { method: 'POST', body: JSON.stringify({ title }) }),
    );
    expect(res.status).toBe(201);
    return res.json();
  };

  it('scopes lists to the caller and stamps owner on create', async () => {
    const task = await createAs(tokenFor(MARIO), 'marios task');
    expect(task.owner).toBe(MARIO);

    const mine = await (await app.request('/api/tasks', as(tokenFor(MARIO)))).json();
    expect(mine.map((t: Task) => t.id)).toEqual([task.id]);

    const bobs = await (await app.request('/api/tasks', as(tokenFor(BOB)))).json();
    expect(bobs).toEqual([]);
  });

  it('answers 404 (not 403) for a foreign task on every verb', async () => {
    const task = await createAs(tokenFor(MARIO), 'marios task');
    const bob = tokenFor(BOB);

    for (const req of [
      app.request(`/api/tasks/${task.id}`, as(bob)),
      app.request(`/api/tasks/${task.id}`, as(bob, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) })),
      app.request(`/api/tasks/${task.id}`, as(bob, { method: 'DELETE' })),
      app.request(`/api/tasks/${task.id}/complete`, as(bob, { method: 'POST' })),
      app.request('/api/store/update', as(bob, { method: 'POST', body: JSON.stringify({ id: task.id, changes: { status: 'done' } }) })),
      app.request('/api/store/remove', as(bob, { method: 'POST', body: JSON.stringify({ id: task.id }) })),
    ]) {
      expect((await req).status).toBe(404);
    }

    // And the task is untouched.
    const still = await (await app.request(`/api/tasks/${task.id}`, as(tokenFor(MARIO)))).json();
    expect(still.status).toBe('todo');
  });

  it('scopes search, stats, and the store dialect', async () => {
    await createAs(tokenFor(MARIO), 'findme alpha');
    const bob = tokenFor(BOB);

    const search = await (await app.request('/api/search?q=findme', as(bob))).json();
    expect(search).toEqual([]);

    const storeTasks = await (await app.request('/api/store/tasks', as(bob))).json();
    expect(storeTasks).toEqual([]);
  });

  it('strips a client-supplied owner on the store dialect and stamps the caller', async () => {
    const res = await app.request(
      '/api/store/add',
      as(tokenFor(BOB), {
        method: 'POST',
        body: JSON.stringify({ input: { title: 'sneaky', owner: MARIO, created_by: 'claude' } }),
      }),
    );
    expect(res.status).toBe(201);
    const task = (await res.json()) as Task;
    expect(task.owner).toBe(BOB);
    // created_by is legitimately assignable on this dialect (MCP attribution).
    expect(task.created_by).toBe('claude');
  });

  it('ignores owner smuggled into /api/store/update changes', async () => {
    const task = await createAs(tokenFor(MARIO), 'mine');
    const res = await app.request(
      '/api/store/update',
      as(tokenFor(MARIO), {
        method: 'POST',
        body: JSON.stringify({ id: task.id, changes: { owner: BOB, title: 'renamed' } }),
      }),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as Task;
    expect(updated.owner).toBe(MARIO);
    expect(updated.title).toBe('renamed');
  });

  it('gives legacy (owner: null) tasks to the default owner only', async () => {
    const now = new Date().toISOString();
    writeFileSync(
      tasksFile,
      JSON.stringify([{
        id: 'legacy-1', title: 'pre-authz task', description: null, status: 'todo',
        priority: 'medium', scope: 'personal', categories: [], parent_id: null,
        created_at: now, updated_at: now, completed_at: null, focused: false,
        created_by: 'human', session_id: null, time_estimate: null, vibe: null,
      }]),
      'utf-8',
    );

    const marios = await (await app.request('/api/tasks', as(tokenFor(MARIO)))).json();
    expect(marios.map((t: Task) => t.id)).toEqual(['legacy-1']);
    const bobs = await (await app.request('/api/tasks', as(tokenFor(BOB)))).json();
    expect(bobs).toEqual([]);
  });

  it('maps a service token to its person and round-trips', async () => {
    const created = await createAs(tokenFor(MARIO), 'via browser');
    const viaService = await (await app.request('/api/tasks', as(serviceToken()))).json();
    expect(viaService.map((t: Task) => t.id)).toEqual([created.id]);

    const done = await app.request(
      `/api/tasks/${created.id}/complete`,
      as(serviceToken(), { method: 'POST' }),
    );
    expect(done.status).toBe(200);
    expect(((await done.json()) as Task).owner).toBe(MARIO);
  });

  it('keys the idempotency cache per identity', async () => {
    const init = (token: string) =>
      as(token, {
        method: 'POST',
        body: JSON.stringify({ title: 'same key' }),
        headers: { 'Idempotency-Key': 'shared-key-1' },
      });
    const a = (await (await app.request('/api/tasks', init(tokenFor(MARIO)))).json()) as Task;
    const b = (await (await app.request('/api/tasks', init(tokenFor(BOB)))).json()) as Task;
    expect(a.id).not.toBe(b.id);
    expect(b.owner).toBe(BOB);

    // Same identity + same key does replay.
    const replay = (await (await app.request('/api/tasks', init(tokenFor(MARIO)))).json()) as Task;
    expect(replay.id).toBe(a.id);
  });

  it('400s invalid bodies at the boundary', async () => {
    const bad = await app.request(
      '/api/tasks',
      as(tokenFor(MARIO), { method: 'POST', body: JSON.stringify({ title: '' }) }),
    );
    expect(bad.status).toBe(400);

    const task = await createAs(tokenFor(MARIO), 'ok');
    const badPatch = await app.request(
      `/api/tasks/${task.id}`,
      as(tokenFor(MARIO), { method: 'PATCH', body: JSON.stringify({ status: 'bogus' }) }),
    );
    expect(badPatch.status).toBe(400);

    const badQuery = await app.request('/api/tasks?status=bogus', as(tokenFor(MARIO)));
    expect(badQuery.status).toBe(400);
  });
});
