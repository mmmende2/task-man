import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { MetricsMode } from '../ui/modes/MetricsMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

describe('MetricsMode display', () => {
  let tmpDir: string;
  let store: TaskStore;
  let cleanup: () => void;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-metrics-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));

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

  it('renders done today count as hero metric', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    expect(result.text()).toContain('Done today: 1');
  });

  it('renders progress bar without percentage label', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // Progress bar present (block chars) but no "Focus progress" label
    expect(text).toContain('▰');
    expect(text).not.toContain('Focus progress');
  });

  it('renders creator attribution', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('You:');
    expect(text).toContain('Claude:');
  });

  it('renders today\'s progress section', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain("Today's Progress");
  });

  it('uses priority dots instead of status icons', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // Should use radio-style markers (filled/unfilled), not status brackets
    expect(text).toMatch(/◉|○/);
    expect(text).not.toMatch(/\[x\]|\[~\]|\[ \]/);
    // Should not contain emoji
    expect(text).not.toContain('✅');
    expect(text).not.toContain('🔄');
  });

  it('only shows tasks completed today in focused list', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // Done Task was completed today, should appear
    expect(text).toContain('Done Task');
    // Active and Todo were not completed today and have no subtasks done today
    expect(text).not.toContain('Active Task');
    expect(text).not.toContain('Todo Task');
  });
});
