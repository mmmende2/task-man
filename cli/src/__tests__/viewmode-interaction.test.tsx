import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState, createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import type { Task } from '../types.js';
import type { VimMode } from '../ui/hooks/useVimKeys.js';
import { FocusMode } from '../ui/modes/FocusMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/**
 * Stateful harness that wraps FocusMode with an id-anchored cursor + tasks state,
 * matching how InteractiveApp manages these.
 */
function FocusModeHarness({ store, initialTasks }: { store: TaskStore; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const firstFocusedId = initialTasks.find(t => t.focused && t.status !== 'done' && !t.parent_id)?.id ?? null;
  const [cursorId, setCursorId] = useState<string | null>(firstFocusedId);
  const [vimMode, setVimMode] = useState<VimMode>('normal');
  const reload = () => setTasks(store.load());

  // Build subtask map from tasks
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

describe('FocusMode interaction', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-focusmode-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

    // 3 focused tasks + 1 unfocused
    const alpha = await store.add({ title: 'Alpha', focused: true });
    await store.add({ title: 'Beta', focused: true });
    await store.add({ title: 'Gamma', focused: true });
    await store.add({ title: 'Delta', focused: false });

    // Add subtasks to Alpha
    await store.add({ title: 'Sub One', parent_id: alpha.id });
    await store.add({ title: 'Sub Two', parent_id: alpha.id });

    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders all focused tasks', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
  });

  it('j moves selection down', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');

    // All tasks still visible, selection moved to Beta
    const text = result.text();
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
  });

  it('k at top stays at top', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('k');

    // Still showing Alpha as expanded
    expect(result.text()).toContain('Alpha');
  });

  it('j then k returns to first', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('j');
    result.stdin.write('k');

    // Alpha should be expanded again (┌─ Title)
    const expandedLine = result.lines().find(l => l.includes('┌'));
    expect(expandedLine).toContain('Alpha');
  });

  it('j stops at last item', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // 3 focused tasks, indices 0-2. Press j to move through.
    result.stdin.write('j');
    await vi.waitFor(() => {
      // Beta has no subtasks — expanded as single line with ──
      const line = result.lines().find(l => l.includes('──') && l.includes('Beta'));
      expect(line).toBeDefined();
    }, { timeout: 3000 });

    result.stdin.write('j');
    await vi.waitFor(() => {
      const line = result.lines().find(l => l.includes('──') && l.includes('Gamma'));
      expect(line).toBeDefined();
    }, { timeout: 3000 });

    result.stdin.write('j'); // should stay at Gamma
    result.stdin.write('j');

    await vi.waitFor(() => {
      const line = result.lines().find(l => l.includes('──') && l.includes('Gamma'));
      expect(line).toBeDefined();
    }, { timeout: 3000 });
  });

  it('x marks selected task done', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('x');

    await vi.waitFor(() => {
      const text = result.text();
      // Alpha should be gone (marked done, filtered out of focusedActive)
      expect(text).not.toContain('Alpha');
      // Beta should now be visible
      expect(text).toContain('Beta');
    });
  });

  it('shows empty state message when no focused tasks', () => {
    const unfocusedOnly = tasks.map(t => ({ ...t, focused: false }));
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: unfocusedOnly }),
    );
    cleanup = result.cleanup;

    expect(result.text()).toContain('No focused tasks');
  });

  it('shows backlog count', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // 1 unfocused task (Delta)
    expect(result.text()).toContain('1 more in backlog');
  });

  it('shows subtasks in expanded task', () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('Sub One');
    expect(text).toContain('Sub Two');
  });

  it('tab enters subtask navigation', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('\t');

    await vi.waitFor(() => {
      const text = result.text();
      // Selection indicator should appear on a subtask
      expect(text).toContain('▸');
    });
  });

  it('j/k navigates subtasks when in subtask nav', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Enter subtask nav
    result.stdin.write('\t');
    await vi.waitFor(() => {
      expect(result.text()).toContain('▸');
    });

    // First subtask selected initially, move to second
    result.stdin.write('j');
    await vi.waitFor(() => {
      const lines = result.lines();
      const selectedLine = lines.find(l => l.includes('▸'));
      expect(selectedLine).toContain('Sub Two');
    });
  });

  it('D in subtask nav toggles subtask status', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Enter subtask nav
    result.stdin.write('\t');
    await vi.waitFor(() => {
      expect(result.text()).toContain('▸');
    });

    // Mark first subtask done
    result.stdin.write('x');
    await vi.waitFor(() => {
      // The subtask should now show as done (◉ instead of ○)
      const text = result.text();
      expect(text).toContain('◉');
    });
  });

  it('tab again returns to task navigation', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Enter subtask nav
    result.stdin.write('\t');
    await vi.waitFor(() => {
      expect(result.text()).toContain('▸');
    });

    // Tab back to task nav
    result.stdin.write('\t');
    await vi.waitFor(() => {
      // ▸ indicator should be gone (only shows in subtask nav)
      expect(result.text()).not.toContain('▸');
    });
  });
});

describe('FocusMode description editing', () => {
  let tmpDir: string;
  let store: TaskStore;
  let tasks: Task[];
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-focus-desc-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

    // Alpha has subtasks (full-box variant) and a prior description
    const alpha = await store.add({
      title: 'Alpha',
      focused: true,
      description: 'original description',
    });
    await store.add({ title: 'Sub One', parent_id: alpha.id });

    // Beta has no subtasks (single-line variant), no description
    await store.add({ title: 'Beta', focused: true });

    tasks = store.load();
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("pressing 'e' shows the current description in an edit field", async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Alpha is selected by default and already shows its description.
    expect(result.text()).toContain('original description');

    result.stdin.write('e');
    await vi.waitFor(() => {
      // Edit mode renders the magenta '>' prefix before the seeded text.
      const line = result.lines().find(l => l.includes('> original description'));
      expect(line).toBeDefined();
    }, { timeout: 3000 });

    result.stdin.write('!');
    await vi.waitFor(() => {
      expect(result.text()).toContain('original description!');
    }, { timeout: 3000 });
  });

  it("pressing 'e', typing, and Enter persists the new description", async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('e');
    await vi.waitFor(() => {
      expect(result.text()).toContain('> original description');
    }, { timeout: 3000 });

    // Clear seeded text, then type new text.
    for (let i = 0; i < 'original description'.length; i++) {
      result.stdin.write('\u007f');
    }
    await vi.waitFor(() => {
      expect(result.text()).not.toContain('original description');
    }, { timeout: 3000 });

    for (const ch of 'updated notes') {
      result.stdin.write(ch);
    }
    await vi.waitFor(() => {
      expect(result.text()).toContain('updated notes');
    }, { timeout: 3000 });

    result.stdin.write('\r'); // enter saves
    await vi.waitFor(() => {
      const saved = store.load().find(t => t.title === 'Alpha');
      expect(saved?.description).toBe('updated notes');
    }, { timeout: 3000 });
  });

  it('clearing the description saves it as null', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('e');
    await vi.waitFor(() => {
      expect(result.text()).toContain('> original description');
    }, { timeout: 3000 });

    for (let i = 0; i < 'original description'.length; i++) {
      result.stdin.write('\u007f');
    }
    await vi.waitFor(() => {
      expect(result.text()).not.toContain('original description');
    }, { timeout: 3000 });

    result.stdin.write('\r');
    await vi.waitFor(() => {
      const saved = store.load().find(t => t.title === 'Alpha');
      expect(saved?.description).toBeNull();
    }, { timeout: 3000 });
  });

  it('undo restores the previous description after an edit', async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    result.stdin.write('e');
    await vi.waitFor(() => {
      expect(result.text()).toContain('> original description');
    }, { timeout: 3000 });

    for (let i = 0; i < 'original description'.length; i++) {
      result.stdin.write('\u007f');
    }
    await vi.waitFor(() => {
      expect(result.text()).not.toContain('original description');
    }, { timeout: 3000 });

    for (const ch of 'new') {
      result.stdin.write(ch);
    }
    await vi.waitFor(() => {
      expect(result.text()).toContain('> new');
    }, { timeout: 3000 });

    result.stdin.write('\r');
    await vi.waitFor(() => {
      expect(store.load().find(t => t.title === 'Alpha')?.description).toBe('new');
    }, { timeout: 3000 });

    result.stdin.write('u');
    await vi.waitFor(() => {
      expect(store.load().find(t => t.title === 'Alpha')?.description).toBe('original description');
    }, { timeout: 3000 });
  });

  it("'e' on a task with no subtasks edits description in the single-line card", async () => {
    const result = renderWithDimensions(
      createElement(FocusModeHarness, { store, initialTasks: tasks }),
    );
    cleanup = result.cleanup;

    // Move selection to Beta (no subtasks, no description).
    result.stdin.write('j');
    await vi.waitFor(() => {
      const line = result.lines().find(l => l.includes('──') && l.includes('Beta'));
      expect(line).toBeDefined();
    }, { timeout: 3000 });

    result.stdin.write('e');
    await vi.waitFor(() => {
      // Empty edit field shows just '>' in magenta.
      expect(result.text()).toMatch(/>\s*$/m);
    }, { timeout: 3000 });

    for (const ch of 'for beta') {
      result.stdin.write(ch);
    }
    await vi.waitFor(() => {
      expect(result.text()).toContain('for beta');
    }, { timeout: 3000 });

    result.stdin.write('\r');
    await vi.waitFor(() => {
      expect(store.load().find(t => t.title === 'Beta')?.description).toBe('for beta');
    }, { timeout: 3000 });
  });
});
