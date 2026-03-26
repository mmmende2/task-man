import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState, createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import type { Task } from '../types.js';
import { PlanMode } from '../ui/modes/PlanMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/**
 * Stateful harness wrapping PlanMode with selectedIndex + tasks state.
 */
function PlanModeHarness({ store, initialTasks }: { store: TaskStore; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedIndex, setSelectedIndex] = useState(0);
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

  it('renders focused and backlog sections', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const text = result.text();

    expect(text).toContain('FOCUSED (2)');
    expect(text).toContain('BACKLOG (2)');
  });

  it('selection marker on first item', () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;
    const text = result.text();

    // ▸ should appear next to Focused-A
    expect(text).toContain('▸');
    expect(text).toContain('Focused-A');
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
      expect(text).toContain('FOCUSED (1)');
      expect(text).toContain('BACKLOG (3)');
    });
  });

  it('space focuses a backlog task', async () => {
    const result = renderWithDimensions(
      createElement(PlanModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Navigate to Backlog-A (index 2) — verify selection marker moves
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
      const text = result.text();
      expect(text).toContain('FOCUSED (3)');
      expect(text).toContain('BACKLOG (1)');
    });
  });
});
