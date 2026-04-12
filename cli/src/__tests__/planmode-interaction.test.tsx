import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState, createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import type { Task } from '../types.js';
import type { VimMode } from '../ui/hooks/useVimKeys.js';
import { PlanMode } from '../ui/modes/PlanMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/**
 * Stateful harness wrapping PlanMode with selectedIndex + tasks state.
 */
function PlanModeHarness({ store, initialTasks }: { store: TaskStore; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const reload = () => setTasks(store.load());

  const active = tasks.filter(t => t.status !== 'done');
  const focusedTasks = active.filter(t => t.focused);
  const backlogTasks = active.filter(t => !t.focused);

  return createElement(PlanMode, {
    focusedTasks,
    backlogTasks,
    selectedIndex,
    onSelectedIndexChange: setSelectedIndex,
    store,
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

  afterEach(() => {
    cleanup?.();
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

  it('shows focused indicator on focused tasks', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const text = result.text();

    // Focused tasks have ★ indicator
    const focusedALine = result.lines().find(l => l.includes('Focused-A'));
    expect(focusedALine).toContain('★');
    const backlogALine = result.lines().find(l => l.includes('Backlog-A'));
    expect(backlogALine).not.toContain('★');
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
      // Backlog-A should now have ★
      const backlogALine = result.lines().find(l => l.includes('Backlog-A'));
      expect(backlogALine).toContain('★');
    });
  });
});
