import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { WriteMode } from '../ui/modes/WriteMode.js';
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
  let cleanup: () => void;
  let modeChanges: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-writemode-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    modeChanges = [];
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function renderWrite() {
    return renderWithDimensions(
      createElement(WriteMode, {
        store,
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

    // Now create a subtask with : prefix
    typeChars(result.stdin, ':Child');
    await vi.waitFor(() => expect(result.text()).toContain(':Child'));

    result.stdin.write('\r');

    await vi.waitFor(() => {
      const tasks = store.load();
      expect(tasks.length).toBe(2);
      const child = tasks.find(t => t.title === 'Child');
      expect(child).toBeDefined();
      expect(child!.parent_id).not.toBeNull();
    });
  });
});
