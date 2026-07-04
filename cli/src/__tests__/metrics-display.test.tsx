import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { MetricsMode } from '../ui/modes/MetricsMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

describe('MetricsMode display', () => {
  let tmpDir: string;
  let store: TaskStore;
  let asyncStore: LocalStore;
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-metrics-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    asyncStore = new LocalStore(store);

    // Create some tasks for metrics
    const t1 = await store.add({ title: 'Done Task', focused: true });
    await store.update(t1.id, { status: 'done' });
    await store.add({ title: 'Active Task', focused: true });
    await store.add({ title: 'Todo Task', focused: true });
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders done today count as hero metric', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Done today: 1'));
  });

  it('renders progress bar without percentage label', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    // Progress bar present (block chars) but no "Focus progress" label
    await vi.waitFor(() => expect(result.text()).toContain('▰'));
    expect(result.text()).not.toContain('Focus progress');
  });

  it('renders creator attribution', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => {
      const text = result.text();
      expect(text).toContain('You:');
      expect(text).toContain('Claude:');
    });
  });

  it('renders today\'s progress section', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain("Today's Progress"));
  });

  it('uses priority dots instead of status icons', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toMatch(/◉|○/));
    const text = result.text();
    expect(text).not.toMatch(/\[x\]|\[~\]|\[ \]/);
    // Should not contain emoji
    expect(text).not.toContain('✅');
    expect(text).not.toContain('🔄');
  });

  it('only shows tasks completed today in focused list', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Done Task'));
    const text = result.text();
    // Active and Todo were not completed today and have no subtasks done today
    expect(text).not.toContain('Active Task');
    expect(text).not.toContain('Todo Task');
  });

  it('still includes tasks completed today even if they are unfocused', async () => {
    // Unfocus the completed task — it should still appear on the metrics page.
    const tasks = store.load();
    const doneTask = tasks.find(t => t.title === 'Done Task')!;
    await store.update(doneTask.id, { focused: false });

    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Done Task'));
    expect(result.text()).toContain('Done today: 1');
  });
});
