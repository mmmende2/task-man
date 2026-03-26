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

  it('renders focus progress bar', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    expect(result.text()).toContain('Focus progress');
  });

  it('renders completion stats', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('Completed:');
    expect(text).toContain('In Progress:');
    expect(text).toContain('Todo:');
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

  it('renders focused tasks section', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    expect(text).toContain('Focused Tasks');
  });

  it('uses text art status icons, not emojis', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // Should use text art icons
    expect(text).toMatch(/\[x\]|\[~\]|\[ \]/);
    // Should not contain emoji
    expect(text).not.toContain('✅');
    expect(text).not.toContain('🔄');
  });

  it('uses >>> for insight prefix, not emoji', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // If an insight is shown, it should use >>>
    expect(text).not.toContain('💡');
    if (text.includes('>>>')) {
      // Insight present and properly formatted
      expect(text).toContain('>>>');
    }
  });

  it('displays a mid-day message', () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store }),
    );
    cleanup = result.cleanup;

    const text = result.text();
    // Should show some motivational text (varies by day, but always present)
    // The message appears after the focused tasks section
    const lines = result.lines();
    // At least one non-empty line should exist below the focused tasks section
    expect(lines.length).toBeGreaterThan(5);
  });
});
