import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useState, createElement } from 'react';
import { Box } from 'ink';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import type { Task } from '../types.js';
import type { VimMode } from '../ui/hooks/useVimKeys.js';
import { PlanMode } from '../ui/modes/PlanMode.js';
import { Header } from '../ui/shared/Header.js';
import { Footer } from '../ui/shared/Footer.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/**
 * Mirrors the layout from InteractiveApp: fixed termHeight, overflow hidden,
 * PlanMode + flexGrow spacer inside a middle Box. Reproduces the "layered
 * content" bug that appeared when terminal height was smaller than content
 * height — without flexShrink={0} on PlanMode's root, Yoga compressed the
 * column and dropped individual task rows in the middle of each group.
 */
function FullAppHarness({ store, initialTasks, termHeight }: {
  store: TaskStore;
  initialTasks: Task[];
  termHeight: number;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const reload = () => setTasks(store.load());

  const active = tasks.filter(t => t.status !== 'done');
  const focusedTasks = active.filter(t => t.focused);
  const backlogTasks = active.filter(t => !t.focused);

  return createElement(Box, { flexDirection: 'column', height: termHeight, overflow: 'hidden' },
    createElement(Header, {
      mode: 'plan' as const,
      scope: 'all' as const,
      taskCount: { focused: focusedTasks.length, total: active.length },
    }),
    createElement(Box, { flexDirection: 'column', flexGrow: 1, overflow: 'hidden' },
      createElement(PlanMode, {
        focusedTasks,
        backlogTasks,
        selectedIndex,
        onSelectedIndexChange: setSelectedIndex,
        store,
        reload,
        vimMode,
        setVimMode,
        scopeFilter: 'all' as const,
      }),
      createElement(Box, { flexGrow: 1 }),
    ),
    createElement(Footer, { mode: 'plan' as const, vimMode }),
  );
}

describe('PlanMode at fixed terminal height', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-layering-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

    for (let i = 0; i < 3; i++) {
      await store.add({ title: `alpha-task-${i}`, categories: ['alpha'] });
    }
    for (let i = 0; i < 3; i++) {
      await store.add({ title: `beta-task-${i}`, categories: ['beta'] });
    }
    for (let i = 0; i < 3; i++) {
      await store.add({ title: `gamma-task-${i}`, categories: ['gamma'] });
    }
    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders task rows contiguously without dropping rows in the middle', () => {
    const result = renderWithDimensions(
      createElement(FullAppHarness, { store, initialTasks: tasks, termHeight: 18 }),
      { height: 18 },
    );
    cleanup = result.cleanup;
    const lines = result.lines();

    const alphaHeader = lines.findIndex(l => /^\s{0,3}alpha\b/.test(l));
    expect(alphaHeader).toBeGreaterThanOrEqual(0);
    // The three lines immediately below the 'alpha' header must each contain a task row
    expect(lines[alphaHeader + 1]).toContain('alpha-task-0');
    expect(lines[alphaHeader + 2]).toContain('alpha-task-1');
    expect(lines[alphaHeader + 3]).toContain('alpha-task-2');
  });

  it('shows the category header for the first task (no stuck "1 more above")', async () => {
    const result = renderWithDimensions(
      createElement(FullAppHarness, { store, initialTasks: tasks, termHeight: 18 }),
      { height: 18 },
    );
    cleanup = result.cleanup;

    // Scroll down then back up to the first task.
    for (let i = 0; i < 6; i++) {
      result.stdin.write('j');
      await new Promise(r => setTimeout(r, 20));
    }
    for (let i = 0; i < 6; i++) {
      result.stdin.write('k');
      await new Promise(r => setTimeout(r, 20));
    }

    const lines = result.lines();
    // Selection is back on alpha-task-0 and the 'alpha' header should be visible.
    expect(lines.some(l => l.includes('▸') && l.includes('alpha-task-0'))).toBe(true);
    expect(lines.some(l => /^\s{0,3}alpha\b/.test(l))).toBe(true);
    // No stale "↑ 1 more above" — the category header is shown instead.
    expect(lines.some(l => /↑\s*1 more above/.test(l))).toBe(false);
  });

  it('scrolls the window so the selected task stays visible', async () => {
    const result = renderWithDimensions(
      createElement(FullAppHarness, { store, initialTasks: tasks, termHeight: 18 }),
      { height: 18 },
    );
    cleanup = result.cleanup;

    // Navigate past the visible fold (9 tasks total, 3 headers + 3 spacers = 15 rows).
    // Use 'G' (vim: bottom) which moves selection to the last task in one keystroke.
    // Fallback: repeated 'j' with an await between keystrokes so state updates.
    for (let i = 0; i < 8; i++) {
      result.stdin.write('j');
      await new Promise(r => setTimeout(r, 20));
    }

    const lines = result.lines();
    // The last task (gamma-task-2) should now be in view, and the window should
    // have scrolled past the top so the 'more above' indicator appears.
    expect(lines.some(l => l.includes('gamma-task-2'))).toBe(true);
    expect(lines.some(l => l.includes('more above'))).toBe(true);
    // The selection cursor ▸ should be on a visible line.
    expect(lines.some(l => l.includes('▸') && l.includes('gamma-task-2'))).toBe(true);
  });
});
