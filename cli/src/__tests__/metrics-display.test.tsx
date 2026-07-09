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

  // The default metrics day now depends on the time of day, so pin the clock
  // to an afternoon (→ opens on today) for these display tests. Fake only Date
  // so ink's real timers keep driving the async render.
  const AFTERNOON = new Date(2026, 6, 9, 14, 0, 0); // 2026-07-09 14:00 local
  const YESTERDAY = '2026-07-08';

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AFTERNOON);

    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-metrics-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
    asyncStore = new LocalStore(store);

    // Create some tasks for metrics (completed "today" = the pinned date).
    const t1 = await store.add({ title: 'Done Task', focused: true });
    await store.update(t1.id, { status: 'done' });
    await store.add({ title: 'Active Task', focused: true });
    await store.add({ title: 'Todo Task', focused: true });
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
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

  it('h steps back a day (clamped at the earliest task date), l clamps at today', async () => {
    // A task created "yesterday" makes yesterday the earliest date, so h can
    // step back exactly one day and no further — which makes spamming h
    // idempotent at the floor (tolerates dropped keystrokes).
    vi.setSystemTime(new Date(2026, 6, 8, 10, 0, 0));
    await store.add({ title: 'Old Task', focused: true });
    vi.setSystemTime(AFTERNOON);

    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Done today: 1'));

    // h: step back, clamped at yesterday (the earliest task date).
    await vi.waitFor(() => {
      result.stdin.write('h');
      expect(result.text()).toContain(`Done on ${YESTERDAY}`);
    }, { timeout: 2000, interval: 60 });
    expect(result.text()).toContain(`Progress — ${YESTERDAY}`);

    // l: step forward, clamped at today.
    await vi.waitFor(() => {
      result.stdin.write('l');
      expect(result.text()).toContain('Done today');
    }, { timeout: 2000, interval: 60 });
  });

  it('does not step the day while editing the date, and D opens the editor', async () => {
    const result = renderWithDimensions(
      createElement(MetricsMode, { store: asyncStore }),
    );
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Done today: 1'));

    // D opens the date editor.
    await vi.waitFor(() => {
      result.stdin.write('D');
      expect(result.text()).toContain('Go to date:');
    }, { timeout: 2000, interval: 60 });

    // h while editing is treated as text input, never a day-step: the editor
    // stays open and no past-day view ("Done on …") appears.
    result.stdin.write('h');
    await new Promise((r) => setTimeout(r, 100));
    expect(result.text()).toContain('Go to date:');
    expect(result.text()).not.toContain('Done on');
  });
});
