import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { WriteMode } from '../ui/modes/WriteMode.js';
import { getCurrentSessionId } from '../sessions.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

/** Write a string to stdin one character at a time (ink useInput expects single chars). */
function typeChars(stdin: { write: (s: string) => void }, text: string) {
  for (const ch of text) {
    stdin.write(ch);
  }
}

describe('WriteMode interaction', () => {
  let tmpDir: string;
  let store: TaskStore;
  let asyncStore: LocalStore;
  let cleanup: () => void;
  let modeChanges: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-writemode-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    asyncStore = new LocalStore(store);
    modeChanges = [];
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function renderWrite() {
    return renderWithDimensions(
      createElement(WriteMode, {
        store: asyncStore,
        reload: () => {},
        scopeFilter: 'all',
        onModeChange: (mode: string) => modeChanges.push(mode),
        onCycleScope: () => {},
      }),
    );
  }

  it('renders input cursor in title phase', () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('>');
    expect(text).toContain('Type task title');
  });

  it('typing updates the input display', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Hello');

    await vi.waitFor(() => {
      expect(result.text()).toContain('Hello');
    });
  });

  it('enter saves task immediately with default medium priority', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'My Task');
    await vi.waitFor(() => expect(result.text()).toContain('My Task'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('My Task');
      expect(tasks[0].priority).toBe('medium');
    });
  });

  it('flag -p sets priority inline', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Test Task -p high');
    await vi.waitFor(() => expect(result.text()).toContain('Test Task'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Test Task');
      expect(tasks[0].priority).toBe('high');
    });
  });

  it('flag -p l sets low priority', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Low Task -p l');
    await vi.waitFor(() => expect(result.text()).toContain('Low Task'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].priority).toBe('low');
    });
  });

  it('no flag defaults to medium priority', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Plain Task');
    await vi.waitFor(() => expect(result.text()).toContain('Plain Task'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].priority).toBe('medium');
    });
  });

  it('esc returns to focus mode', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    result.stdin.write('\x1B');

    await vi.waitFor(() => {
      expect(modeChanges).toContain('focus');
    });
  });

  it('category parsed from title - category format', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Buy groceries - errands');
    await vi.waitFor(() => expect(result.text()).toContain('Buy groceries'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Buy groceries');
      expect(tasks[0].categories).toContain('errands');
    });
  });

  it('flag -c sets category', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'Do laundry -c housework');
    await vi.waitFor(() => expect(result.text()).toContain('Do laundry'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Do laundry');
      expect(tasks[0].categories).toContain('housework');
    });
  });

  it('subtask prefix : creates a subtask', async () => {
    const result = renderWrite();
    cleanup = result.cleanup;

    // First create a parent task
    typeChars(result.stdin, 'Parent');
    await vi.waitFor(() => expect(result.text()).toContain('Parent'));

    result.stdin.write('\r');
    await vi.waitFor(() => expect(store.load().length).toBe(1));

    // Now create a subtask with : prefix — text is rendered inline under the parent
    typeChars(result.stdin, ':Child');
    await vi.waitFor(() => expect(result.text()).toContain('└─ Child'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(2);
      const child = tasks.find(t => t.title === 'Child');
      expect(child).toBeDefined();
      expect(child!.parent_id).not.toBeNull();
    });
  });

  it('esc enters review sub-mode when tasks are present', async () => {
    await store.add({
      title: 'Existing task',
      categories: ['House Work'],
      scope: 'personal',
      created_by: 'human',
      session_id: getCurrentSessionId(),
    });

    const result = renderWrite();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Existing task'));

    // Esc from capture with tasks present should enter review, not focus mode
    result.stdin.write('\x1B');

    // Give it a tick — if it went to focus, modeChanges would contain 'focus'
    await new Promise(r => setTimeout(r, 50));
    expect(modeChanges).not.toContain('focus');

    // i should switch back to capture (no mode change)
    result.stdin.write('i');
    await new Promise(r => setTimeout(r, 50));
    expect(modeChanges).not.toContain('focus');

    // Another esc (now in capture) still with tasks → review again; then a second esc from review → focus
    result.stdin.write('\x1B');
    await new Promise(r => setTimeout(r, 20));
    result.stdin.write('\x1B');

    await vi.waitFor(() => {
      expect(modeChanges).toContain('focus');
    });
  });

  it('tab from review creates subtask inline for cursored parent', async () => {
    const parent = await store.add({
      title: 'Parent Task',
      scope: 'personal',
      created_by: 'human',
      session_id: getCurrentSessionId(),
    });

    const result = renderWrite();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Parent Task'));

    // Enter review (esc from empty capture with tasks present)
    result.stdin.write('\x1B');
    await vi.waitFor(() => expect(result.text()).toContain('REVIEW'));

    // Tab opens an inline subtask-create row since parent has no subs yet
    result.stdin.write('\t');
    await vi.waitFor(() => {
      // subtask-create row renders `▸ └─ ` with an InlineEdit `> ` inside it
      expect(result.text()).toMatch(/▸\s+└─\s+>/);
    });

    typeChars(result.stdin, 'Child Task');
    await vi.waitFor(() => expect(result.text()).toContain('Child Task'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      const child = tasks.find(t => t.title === 'Child Task');
      expect(child).toBeDefined();
      expect(child!.parent_id).toBe(parent.id);
    });
  });

  it('cc in review edits subtask title inline when tab-navigated to subtask', async () => {
    const parent = await store.add({
      title: 'Parent Task',
      scope: 'personal',
      created_by: 'human',
      session_id: getCurrentSessionId(),
    });
    await store.add({
      title: 'Original Sub',
      parent_id: parent.id,
      scope: 'personal',
      created_by: 'human',
      session_id: getCurrentSessionId(),
    });

    const result = renderWrite();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Original Sub'));

    // Enter review
    result.stdin.write('\x1B');
    await vi.waitFor(() => expect(result.text()).toContain('REVIEW'));

    // Tab moves into subtask nav
    result.stdin.write('\t');
    await new Promise(r => setTimeout(r, 20));

    // cc starts editing the cursored subtask title
    result.stdin.write('c');
    result.stdin.write('c');
    await new Promise(r => setTimeout(r, 20));

    // Wipe old title and type new one
    for (let i = 0; i < 'Original Sub'.length; i++) {
      result.stdin.write('\x7f');
    }
    typeChars(result.stdin, 'Renamed Sub');
    await vi.waitFor(() => expect(result.text()).toContain('Renamed Sub'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      const sub = tasks.find(t => t.parent_id === parent.id);
      expect(sub).toBeDefined();
      expect(sub!.title).toBe('Renamed Sub');
    });
  });

  it('tab accepts category ghost and rewrites input', async () => {
    // Pre-populate a category so autocomplete has something to match
    await store.add({
      title: 'existing',
      categories: ['House Work'],
      scope: 'personal',
      created_by: 'human',
      session_id: getCurrentSessionId(),
    });

    const result = renderWrite();
    cleanup = result.cleanup;

    typeChars(result.stdin, 'clean dishes -c hou');
    await vi.waitFor(() => expect(result.text()).toContain('-c hou'));

    // Tab should accept the ghost
    result.stdin.write('\t');

    await vi.waitFor(() => {
      // After tab, the input is rewritten as `-c "House Work" ` — the quoted
      // form only appears in the input line, not the category header above.
      expect(result.text()).toContain('"House Work"');
    });

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const task = store.load().find(t => t.title === 'clean dishes');
      expect(task).toBeDefined();
      expect(task!.categories).toEqual(['House Work']);
    });
  });

  it('shows scroll hint when tasks overflow the visible window', async () => {
    for (let i = 0; i < 12; i++) {
      await store.add({
        title: `task-${i}`,
        categories: ['work'],
        scope: 'personal',
        created_by: 'human',
        session_id: getCurrentSessionId(),
      });
    }

    const result = renderWithDimensions(
      createElement(WriteMode, {
        store: asyncStore,
        reload: () => {},
        scopeFilter: 'all',
        onModeChange: (mode: string) => modeChanges.push(mode),
        onCycleScope: () => {},
      }),
      { height: 20 },
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      expect(result.text()).toContain('task-0');
    });

    const text = result.text();
    // With 12 tasks, 1 category header, and a trailing spacer — 14 rows.
    // At termHeight=20 with capture pane visible, the list window is ~7 rows.
    // So we expect the "↓ N more below" hint to appear.
    expect(text).toMatch(/more below/);
  });
});
