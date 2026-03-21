import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskStore } from '../store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('TaskStore', () => {
  let tmpDir: string;
  let store: TaskStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-test-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with empty task list', () => {
    expect(store.load()).toEqual([]);
  });

  it('adds a task with defaults', async () => {
    const task = await store.add({ title: 'Test task' });
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.scope).toBe('personal');
    expect(task.focused).toBe(false);
    expect(task.created_by).toBe('human');
    expect(task.id).toBeTruthy();
  });

  it('persists tasks to disk', async () => {
    await store.add({ title: 'Persisted task' });
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Persisted task');
  });

  it('resolves ID by prefix', async () => {
    const task = await store.add({ title: 'Prefix test' });
    const prefix = task.id.slice(0, 8);
    expect(store.resolveId(prefix)).toBe(task.id);
  });

  it('throws on ambiguous prefix', async () => {
    // Full UUIDs won't collide in practice, but we can test the error path
    await store.add({ title: 'Task A' });
    await store.add({ title: 'Task B' });
    // Empty prefix matches all
    expect(() => store.resolveId('')).toThrow('Multiple tasks match');
  });

  it('throws on unknown prefix', () => {
    expect(() => store.resolveId('nonexistent')).toThrow('No task found');
  });

  it('updates a task status to done', async () => {
    const task = await store.add({ title: 'Complete me' });
    const updated = await store.update(task.id.slice(0, 8), { status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.completed_at).toBeTruthy();
  });

  it('clears completed_at when status changes from done', async () => {
    const task = await store.add({ title: 'Toggle me' });
    await store.update(task.id, { status: 'done' });
    const restarted = await store.update(task.id, { status: 'in_progress' });
    expect(restarted.completed_at).toBeNull();
  });

  it('queries by scope', async () => {
    await store.add({ title: 'Personal', scope: 'personal' });
    await store.add({ title: 'Professional', scope: 'professional' });
    const personal = store.query({ scope: 'personal' });
    expect(personal).toHaveLength(1);
    expect(personal[0].title).toBe('Personal');
  });

  it('queries by focused', async () => {
    await store.add({ title: 'Focused', focused: true });
    await store.add({ title: 'Backlog' });
    const focused = store.query({ focused: true });
    expect(focused).toHaveLength(1);
    expect(focused[0].title).toBe('Focused');
  });

  it('queries by category', async () => {
    await store.add({ title: 'Tagged', categories: ['backend', 'urgent'] });
    await store.add({ title: 'Untagged' });
    const tagged = store.query({ category: 'backend' });
    expect(tagged).toHaveLength(1);
    expect(tagged[0].title).toBe('Tagged');
  });

  it('inherits parent scope for subtasks', async () => {
    const parent = await store.add({ title: 'Parent', scope: 'professional' });
    const child = await store.add({ title: 'Child', parent_id: parent.id });
    expect(child.scope).toBe('professional');
  });

  it('gets tasks completed on a date', async () => {
    const task = await store.add({ title: 'Done today' });
    await store.update(task.id, { status: 'done' });
    const today = new Date().toISOString().slice(0, 10);
    const completed = store.getCompletedOn(today);
    expect(completed).toHaveLength(1);
  });
});
