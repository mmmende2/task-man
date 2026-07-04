import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { scopeStore } from '../server/scoped-store.js';
import type { Store } from '../store-interface.js';
import type { Task } from '../types.js';

const MARIO = 'mario@example.com';
const BOB = 'bob@example.com';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  const now = new Date().toISOString();
  return {
    title: overrides.id,
    description: null,
    status: 'todo',
    priority: 'medium',
    scope: 'personal',
    categories: [],
    parent_id: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    focused: false,
    created_by: 'human',
    session_id: null,
    time_estimate: null,
    vibe: null,
    owner: null,
    ...overrides,
  };
}

describe('scopeStore', () => {
  let tmpDir: string;
  let tasksFile: string;
  let raw: Store;
  let mario: Store;
  let bob: Store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-scoped-'));
    tasksFile = join(tmpDir, 'tasks.json');
    raw = new LocalStore(new TaskStore(tasksFile));
    // MARIO is also the default owner: legacy (owner: null) tasks are his.
    mario = scopeStore(raw, MARIO, MARIO);
    bob = scopeStore(raw, BOB, MARIO);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const seed = (tasks: Task[]) => writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

  it('stamps owner on add and isolates reads both ways', async () => {
    const t = await mario.add({ title: 'mine' });
    expect(t.owner).toBe(MARIO);
    expect(await mario.load()).toHaveLength(1);
    expect(await bob.load()).toHaveLength(0);
    expect(await bob.query({ scope: 'personal' })).toHaveLength(0);

    await bob.add({ title: 'his' });
    expect(await mario.load()).toHaveLength(1);
    expect(await bob.load()).toHaveLength(1);
  });

  it('treats legacy (owner: null) tasks as the default owner’s', async () => {
    seed([makeTask({ id: 'legacy-1' })]);
    expect((await mario.load()).map(t => t.id)).toEqual(['legacy-1']);
    expect(await bob.load()).toHaveLength(0);
  });

  it('adopts legacy tasks on update by stamping the owner', async () => {
    seed([makeTask({ id: 'legacy-1' })]);
    const updated = await mario.update('legacy-1', { status: 'in_progress' });
    expect(updated.owner).toBe(MARIO);
  });

  it('treats a foreign full id exactly like a nonexistent one', async () => {
    const t = await mario.add({ title: 'mine' });
    await expect(bob.update(t.id, { status: 'done' })).rejects.toThrow(/No task found/);
    await expect(bob.remove(t.id)).rejects.toThrow(/No task found/);
    await expect(bob.resolveId(t.id)).rejects.toThrow(/No task found/);
  });

  it('rejects foreign parent_id on add and on update', async () => {
    const parent = await mario.add({ title: 'parent' });
    await expect(bob.add({ title: 'sub', parent_id: parent.id })).rejects.toThrow(/No task found/);

    const bobs = await bob.add({ title: 'own' });
    await expect(bob.update(bobs.id, { parent_id: parent.id })).rejects.toThrow(/No task found/);
    // The owned parent works fine.
    const sub = await mario.add({ title: 'sub', parent_id: parent.id });
    expect(sub.parent_id).toBe(parent.id);
    expect(sub.owner).toBe(MARIO);
  });

  it('resolves prefixes within the owner’s namespace only', async () => {
    seed([
      makeTask({ id: 'aaa-mario', owner: MARIO }),
      makeTask({ id: 'aaa-bob', owner: BOB }),
    ]);
    // 'aaa' is ambiguous globally but unique within each namespace.
    expect(await mario.resolveId('aaa')).toBe('aaa-mario');
    expect(await bob.resolveId('aaa')).toBe('aaa-bob');
  });

  it('round-trips scoped indices through remove/insertAt (TUI undo)', async () => {
    seed([
      makeTask({ id: 'b0', owner: BOB }),
      makeTask({ id: 'a0', owner: MARIO }),
      makeTask({ id: 'b1', owner: BOB }),
      makeTask({ id: 'a1', owner: MARIO }),
      makeTask({ id: 'a2', owner: MARIO }),
    ]);

    // a1 is the 2nd of mario's tasks → scoped index 1, not global index 3.
    const { task, index } = await mario.remove('a1');
    expect(index).toBe(1);

    // Undo: re-insert at the scoped index restores mario's relative order —
    // and bob's tasks stay where they were.
    await mario.insertAt(task, index);
    expect((await mario.load()).map(t => t.id)).toEqual(['a0', 'a1', 'a2']);
    expect((await raw.load()).map(t => t.id)).toEqual(['b0', 'a0', 'b1', 'a1', 'a2']);
  });

  it('appends when the scoped index is past the owner’s last task', async () => {
    seed([
      makeTask({ id: 'a0', owner: MARIO }),
      makeTask({ id: 'b0', owner: BOB }),
    ]);
    await mario.insertAt(makeTask({ id: 'a1', owner: MARIO }), 99);
    expect((await mario.load()).map(t => t.id)).toEqual(['a0', 'a1']);
  });

  it('re-stamps owner on insertAt (cannot restore into a foreign namespace)', async () => {
    const inserted = await bob.insertAt(makeTask({ id: 'x', owner: MARIO }), 0);
    expect(inserted.owner).toBe(BOB);
    expect(await mario.load()).toHaveLength(0);
  });

  it('scopes the date-derived reads', async () => {
    const t = await mario.add({ title: 'done today' });
    await mario.update(t.id, { status: 'done' });
    await bob.add({ title: 'bob today' });

    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect((await mario.getCompletedOn(date)).map(x => x.id)).toEqual([t.id]);
    expect(await bob.getCompletedOn(date)).toHaveLength(0);
    expect((await bob.getCreatedOn(date)).map(x => x.title)).toEqual(['bob today']);
  });
});
