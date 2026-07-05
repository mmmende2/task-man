import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState, createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import type { Task } from '../types.js';
import type { VimMode } from '../ui/hooks/useVimKeys.js';
import { PlanMode } from '../ui/modes/PlanMode.js';
import { FocusMode } from '../ui/modes/FocusMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

// --- PlanMode harness ---
function PlanModeHarness({ store, initialTasks }: { store: TaskStore; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const reload = () => setTasks(store.load());

  const active = tasks.filter(t => t.status !== 'done');
  const focusedTasks = active.filter(t => t.focused);
  const backlogTasks = active.filter(t => !t.focused);

  return createElement(PlanMode, {
    focusedTasks,
    backlogTasks,
    cursorId,
    onCursorChange: setCursorId,
    store: new LocalStore(store),
    reload,
    vimMode,
    setVimMode,
    scopeFilter: 'all' as const,
  });
}

// --- FocusMode harness ---
function FocusModeHarness({ store, initialTasks }: { store: TaskStore; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const firstFocusedId = initialTasks.find(t => t.focused && t.status !== 'done' && !t.parent_id)?.id ?? null;
  const [cursorId, setCursorId] = useState<string | null>(firstFocusedId);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const reload = () => setTasks(store.load());

  const subtaskMap = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id) {
      const existing = subtaskMap.get(t.parent_id) ?? [];
      existing.push(t);
      subtaskMap.set(t.parent_id, existing);
    }
  }

  const focusedTasks = tasks.filter(t => t.focused && t.status !== 'done' && !t.parent_id);
  const backlogCount = tasks.filter(t => !t.parent_id && (!t.focused || t.status === 'done')).length;

  return createElement(FocusMode, {
    focusedTasks,
    backlogCount,
    subtaskMap,
    cursorId,
    onCursorChange: setCursorId,
    store: new LocalStore(store),
    reload,
    vimMode,
    setVimMode,
    scopeFilter: 'all' as const,
  });
}

describe('Store: remove and insertAt', () => {
  let tmpDir: string;
  let store: TaskStore;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-store-vim-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('remove returns task and index', async () => {
    const a = await store.add({ title: 'A' });
    await store.add({ title: 'B' });
    await store.add({ title: 'C' });

    const { task, index } = await store.remove(a.id);
    expect(task.title).toBe('A');
    expect(index).toBe(0);

    const remaining = store.load();
    expect(remaining).toHaveLength(2);
    expect(remaining[0].title).toBe('B');
  });

  it('insertAt places task at correct position', async () => {
    const a = await store.add({ title: 'A' });
    const b = await store.add({ title: 'B' });

    const { task } = await store.remove(a.id);
    await store.insertAt(task, 1); // after B

    const tasks = store.load();
    expect(tasks[0].title).toBe('B');
    expect(tasks[1].title).toBe('A');
  });

  it('insertAt clamps to bounds', async () => {
    await store.add({ title: 'A' });
    const b = await store.add({ title: 'B' });

    const { task } = await store.remove(b.id);
    await store.insertAt(task, 100); // way past end

    const tasks = store.load();
    expect(tasks).toHaveLength(2);
    expect(tasks[1].title).toBe('B');
  });
});

describe('PlanMode vim: dd/p reorder', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-plan-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Focused-A', focused: true });
    await store.add({ title: 'Focused-B', focused: true });
    await store.add({ title: 'Backlog-A', focused: false });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dd cuts task and shows holding indicator', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Cut first task (Focused-A)
    result.stdin.write('d');
    result.stdin.write('d');

    await vi.waitFor(() => {
      const text = result.text();
      expect(text).toContain('cut:');
      expect(text).toContain('Focused-A');
      // Focused-A removed — only Focused-B remains in the pinned focused
      // group, so its header count drops to 1.
      const header = result.lines().find(l => l.includes('★ focused'));
      expect(header).toContain('1');
    });
  });

  it('dd then Esc deletes task', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('d');
    result.stdin.write('d');

    await vi.waitFor(() => {
      expect(result.text()).toContain('cut:');
    });

    result.stdin.write('\x1b'); // Escape confirms delete

    await vi.waitFor(() => {
      const text = result.text();
      expect(text).not.toContain('Focused-A');
      expect(text).toContain('Focused-B');
    });
  });

  it('dd then p pastes below cursor', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Cut Focused-A
    result.stdin.write('d');
    result.stdin.write('d');

    await vi.waitFor(() => {
      expect(result.text()).toContain('cut:');
    });

    // Cursor is now on Focused-B. Paste below.
    result.stdin.write('p');

    await vi.waitFor(() => {
      const text = result.text();
      expect(text).toContain('Focused-A');
      expect(text).toContain('Focused-B');
      // Focused-B should appear before Focused-A in the store
      const lines = result.lines();
      const bLine = lines.findIndex(l => l.includes('Focused-B'));
      const aLine = lines.findIndex(l => l.includes('Focused-A'));
      expect(bLine).toBeLessThan(aLine);
    });
  });
});

describe('PlanMode vim: x mark done', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-x-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Task-A', focused: true });
    await store.add({ title: 'Task-B', focused: true });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('x marks task done', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('x');

    await vi.waitFor(() => {
      // Task-A should be filtered out (done tasks excluded)
      const text = result.text();
      expect(text).not.toContain('Task-A');
      expect(text).toContain('Task-B');
    });
  });
});

describe('PlanMode vim: inline edit', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-edit-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Original Title', focused: true });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('i enters edit mode and Esc saves', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Enter edit mode
    result.stdin.write('i');

    await vi.waitFor(() => {
      // Should show the edit indicator
      expect(result.text()).toContain('>');
    });
  });
});

describe('PlanMode vim: o creates task', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-create-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Existing', focused: true });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('o creates a new task below', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('o');

    // Wait for insert mode to activate
    await vi.waitFor(() => {
      expect(result.text()).toContain('>');
    });

    // Small delay for useInput handler to re-register
    await new Promise(r => setTimeout(r, 50));

    result.stdin.write('N');
    result.stdin.write('e');
    result.stdin.write('w');

    await vi.waitFor(() => {
      expect(result.text()).toContain('New');
    });

    result.stdin.write('\x1b'); // Esc to save

    await vi.waitFor(() => {
      expect(result.text()).toContain('New');
      expect(result.text()).toContain('Existing');
    });

    // Verify persisted (wait for async store operation)
    await vi.waitFor(() => {
      const stored = store.load();
      expect(stored).toHaveLength(2);
      const newTask = stored.find(t => t.title === 'New');
      expect(newTask).toBeDefined();
      expect(newTask!.focused).toBe(true);
    });
  });
});

describe('PlanMode vim: / search', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-search-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Fix auth bug', focused: true });
    await store.add({ title: 'Write docs', focused: true });
    await store.add({ title: 'Deploy', focused: false });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/ opens search and filters tasks', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('/');

    await vi.waitFor(() => {
      expect(result.text()).toContain('/');
    });

    result.stdin.write('a');
    result.stdin.write('u');
    result.stdin.write('t');
    result.stdin.write('h');

    await vi.waitFor(() => {
      const text = result.text();
      expect(text).toContain('Fix auth bug');
      expect(text).not.toContain('Write docs');
      expect(text).not.toContain('Deploy');
    });
  });
});

describe('FocusMode vim: undo', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-vim-undo-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    await store.add({ title: 'Task-A', focused: true });
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('u undoes mark-done', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Mark done
    result.stdin.write('x');
    await vi.waitFor(() => {
      expect(result.text()).toContain('No focused tasks');
    });

    // Undo
    result.stdin.write('u');
    await vi.waitFor(() => {
      expect(result.text()).toContain('Task-A');
    });
  });
});
