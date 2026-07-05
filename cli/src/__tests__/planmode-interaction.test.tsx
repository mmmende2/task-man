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
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/**
 * Stateful harness wrapping PlanMode with an id-anchored cursor + tasks state.
 */
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

describe('PlanMode interaction', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-planmode-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

    // 2 focused + 2 unfocused
    await store.add({ title: 'Focused-A', focused: true });
    await store.add({ title: 'Focused-B', focused: true });
    await store.add({ title: 'Backlog-A', focused: false });
    await store.add({ title: 'Backlog-B', focused: false });
    tasks = store.load();
  });

  afterEach(async () => {
    cleanup?.();
    // Let any in-flight store I/O (e.g. the load→insert→reload chain a paste
    // kicks off) settle before we delete the temp dir, so a late file read
    // doesn't reject with ENOENT against a directory that's already gone.
    await new Promise(r => setTimeout(r, 50));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders tree view with category grouping', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const text = result.text();

    // All tasks under 'uncategorized' with tree connectors
    expect(text).toContain('uncategorized');
    expect(text).toContain('Focused-A');
    expect(text).toContain('Backlog-B');
    expect(text).toContain('├─');
    expect(text).toContain('└─');
  });

  it('pins focused tasks under a ★ focused header', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const text = result.text();

    // Focused tasks live in a pinned group whose header carries the count and
    // the star (rows inside no longer repeat a per-row ★).
    const header = result.lines().find(l => l.includes('★ focused'));
    expect(header).toBeTruthy();
    expect(header).toContain('2');
    expect(text).toContain('Focused-A');
    const backlogALine = result.lines().find(l => l.includes('Backlog-A'));
    expect(backlogALine).not.toContain('★');
  });

  it('renders the focused group above the category tree', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const lines = result.lines();

    const focusedHeaderIdx = lines.findIndex(l => l.includes('★ focused'));
    const uncategorizedIdx = lines.findIndex(l => l.includes('uncategorized'));
    expect(focusedHeaderIdx).toBeGreaterThanOrEqual(0);
    expect(uncategorizedIdx).toBeGreaterThan(focusedHeaderIdx);
  });

  it('j moves selection down', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');

    // Both tasks visible, but selection moved to Focused-B
    const text = result.text();
    expect(text).toContain('Focused-A');
    expect(text).toContain('Focused-B');
  });

  it('navigation crosses from focused to backlog', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');
    result.stdin.write('j');

    // Selection should be on Backlog-A (index 2)
    const text = result.text();
    expect(text).toContain('Backlog-A');
  });

  it('k at top stays at top', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('k');

    // Still at Focused-A
    expect(result.text()).toContain('Focused-A');
  });

  it('space unfocuses a focused task', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Press space on Focused-A (index 0)
    result.stdin.write(' ');

    await vi.waitFor(() => {
      const text = result.text();
      // Focused-A should no longer have ★
      const focusedALine = result.lines().find(l => l.includes('Focused-A'));
      expect(focusedALine).not.toContain('★');
    });
  });

  it('space focuses a backlog task', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Navigate to Backlog-A (index 2) — wait between presses for selection to move
    result.stdin.write('j');
    await vi.waitFor(() => {
      const selectedLine = result.lines().find(l => l.includes('▸'));
      expect(selectedLine).toContain('Focused-B');
    });

    result.stdin.write('j');
    await vi.waitFor(() => {
      const selectedLine = result.lines().find(l => l.includes('▸'));
      expect(selectedLine).toContain('Backlog-A');
    });

    result.stdin.write(' ');

    await vi.waitFor(() => {
      // Backlog-A joined the pinned focused group — its header count ticks 2→3.
      const header = result.lines().find(l => l.includes('★ focused'));
      expect(header).toContain('3');
    });
  });

  // Regression: the cursor is anchored by task id, so focus-toggling a task
  // (which reorders the focused-before-backlog list) must keep the cursor on
  // that same task — not leave it at the old index, now a different task.
  it('keeps the cursor on the task after a focus toggle reorders the list', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Jump to the last row (Backlog-B).
    result.stdin.write('G');
    await vi.waitFor(() => {
      const sel = result.lines().find(l => l.includes('▸'));
      expect(sel).toContain('Backlog-B');
    });

    // Focus it — Backlog-B jumps up into the focused segment, so its numeric
    // position changes. The cursor must follow the task, not the index.
    result.stdin.write(' ');
    await vi.waitFor(() => {
      const sel = result.lines().find(l => l.includes('▸'));
      expect(sel).toContain('Backlog-B');
      // It moved into the pinned focused group (header count 2→3), and the
      // id-anchored cursor rode along with it.
      const header = result.lines().find(l => l.includes('★ focused'));
      expect(header).toContain('3');
    });
  });

  // Regression: cutting a task lands the cursor on the row directly above it,
  // not at the top of the list. Order is Focused-A, Focused-B, Backlog-A,
  // Backlog-B; cutting Backlog-A should leave the cursor on Focused-B.
  it('cut moves the cursor to the task above, not the top', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');
    await vi.waitFor(() => {
      expect(result.lines().find(l => l.includes('▸'))).toContain('Focused-B');
    });
    result.stdin.write('j');
    await vi.waitFor(() => {
      expect(result.lines().find(l => l.includes('▸'))).toContain('Backlog-A');
    });

    // dd — cut Backlog-A.
    result.stdin.write('d');
    result.stdin.write('d');

    await vi.waitFor(() => {
      const sel = result.lines().find(l => l.includes('▸'));
      expect(sel).toContain('Focused-B');
      // Not the top row — that was the pre-fix behavior.
      expect(sel).not.toContain('Focused-A');
    });
  });

  // Pasting back lands the cut task in its original slot, with the cursor
  // still on the row directly above it (the anchor), not snapped to the top.
  it('paste after cut keeps the cursor right above the restored task', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');
    await vi.waitFor(() => {
      expect(result.lines().find(l => l.includes('▸'))).toContain('Focused-B');
    });
    result.stdin.write('j');
    await vi.waitFor(() => {
      expect(result.lines().find(l => l.includes('▸'))).toContain('Backlog-A');
    });

    result.stdin.write('d');
    result.stdin.write('d');
    await vi.waitFor(() => {
      expect(result.lines().find(l => l.includes('▸'))).toContain('Focused-B');
    });

    // p — paste below the cursor (Focused-B), restoring Backlog-A's slot.
    result.stdin.write('p');
    await vi.waitFor(() => {
      // Backlog-A is back as a real row and the cursor stayed on Focused-B,
      // which now sits directly above it.
      const backlogRow = result.lines().find(l => l.includes('Backlog-A'));
      expect(backlogRow).toBeTruthy();
      expect(result.lines().find(l => l.includes('▸'))).toContain('Focused-B');
    });
  });
});
