import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  completeTask,
  startTask,
  focusTask,
  unfocusTask,
  searchTasks,
  getStats,
  sortTasks,
} from '../handlers/index.js';

describe('handlers', () => {
  let tmpDir: string;
  let store: TaskStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-handlers-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createTask applies defaults and attribution', async () => {
    const task = await createTask(store, { title: 'Write report', created_by: 'human' });
    expect(task.title).toBe('Write report');
    expect(task.priority).toBe('medium');
    expect(task.created_by).toBe('human');
    expect(task.status).toBe('todo');
  });

  it('createTask resolves a parent prefix into a subtask', async () => {
    const parent = await createTask(store, { title: 'Parent', scope: 'professional' });
    const child = await createTask(store, { title: 'Child', parent_id: parent.id.slice(0, 8) });
    expect(child.parent_id).toBe(parent.id);
    expect(child.scope).toBe('professional'); // inherits parent scope
  });

  it('listTasks filters by focused and respects include_done', async () => {
    await createTask(store, { title: 'Focused todo', focused: true });
    const done = await createTask(store, { title: 'Focused done', focused: true });
    await completeTask(store, done.id);

    const all = listTasks(store, { focused: true });
    expect(all).toHaveLength(2);

    const open = listTasks(store, { focused: true, include_done: false });
    expect(open.map((t) => t.title)).toEqual(['Focused todo']);
  });

  it('sortTasks "focus" orders by priority desc then updated_at desc', async () => {
    const low = await createTask(store, { title: 'low', priority: 'low' });
    const highOld = await createTask(store, { title: 'high-old', priority: 'high' });
    const highNew = await createTask(store, { title: 'high-new', priority: 'high' });
    // touch highNew so it is the most-recently updated of the highs
    await updateTask(store, { id: highNew.id, description: 'bump' });

    const ordered = sortTasks(store.load(), 'focus').map((t) => t.title);
    expect(ordered[0]).toBe('high-new');
    expect(ordered[1]).toBe('high-old');
    expect(ordered[2]).toBe('low');
    expect([low, highOld, highNew]).toHaveLength(3);
  });

  it('updateTask has NO top-level completion guard (web allows it)', async () => {
    const parent = await createTask(store, { title: 'Top-level task' });
    const updated = await updateTask(store, { id: parent.id, status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.completed_at).toBeTruthy();
  });

  it('updateTask rejects making a task its own parent', async () => {
    const t = await createTask(store, { title: 'Self' });
    await expect(updateTask(store, { id: t.id, parent_id: t.id })).rejects.toThrow('its own parent');
  });

  it('completeTask completes a top-level task without guard', async () => {
    const parent = await createTask(store, { title: 'Parent' });
    const done = await completeTask(store, parent.id);
    expect(done.status).toBe('done');
  });

  it('focusTask / unfocusTask toggle focus', async () => {
    const t = await createTask(store, { title: 'Toggle' });
    expect((await focusTask(store, t.id)).focused).toBe(true);
    expect((await unfocusTask(store, t.id)).focused).toBe(false);
  });

  it('focusTask only sets session_id when provided', async () => {
    const t = await createTask(store, { title: 'Keep session', session_id: 'sess-1' });
    const refocused = await focusTask(store, t.id); // no session opt
    expect(refocused.session_id).toBe('sess-1');
    const attributed = await focusTask(store, t.id, { session_id: 'sess-2' });
    expect(attributed.session_id).toBe('sess-2');
  });

  it('startTask marks in_progress', async () => {
    const t = await createTask(store, { title: 'Begin' });
    expect((await startTask(store, t.id)).status).toBe('in_progress');
  });

  it('getTask inlines subtasks; returns null after vanish', async () => {
    const parent = await createTask(store, { title: 'Parent' });
    await createTask(store, { title: 'Sub', parent_id: parent.id });
    const got = getTask(store, parent.id);
    expect(got?.subtasks).toHaveLength(1);
  });

  it('deleteTask reports dangling subtask count', async () => {
    const parent = await createTask(store, { title: 'Parent' });
    await createTask(store, { title: 'Sub', parent_id: parent.id });
    const { task, danglingSubtasks } = await deleteTask(store, parent.id);
    expect(task.title).toBe('Parent');
    expect(danglingSubtasks).toBe(1);
  });

  it('searchTasks matches title and description, honors include_done', async () => {
    await createTask(store, { title: 'Buy milk', description: 'whole' });
    const done = await createTask(store, { title: 'Buy bread' });
    await completeTask(store, done.id);

    expect(searchTasks(store, { query: 'buy' })).toHaveLength(2);
    expect(searchTasks(store, { query: 'buy', include_done: false })).toHaveLength(1);
    expect(searchTasks(store, { query: 'whole' })).toHaveLength(1);
  });

  it('getStats counts parents, focus and today completions', async () => {
    const a = await createTask(store, { title: 'A', focused: true });
    await createTask(store, { title: 'B' });
    await completeTask(store, a.id);
    const stats = getStats(store);
    expect(stats.total).toBe(2);
    expect(stats.completed_today).toBe(1);
    expect(stats.backlog).toBe(1);
  });
});
