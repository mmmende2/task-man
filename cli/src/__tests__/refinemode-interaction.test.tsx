import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStore } from '../store.js';
import { LocalStore } from '../local-store.js';
import { RefineMode } from '../ui/modes/RefineMode.js';
import { renderWithDimensions } from './helpers/renderWithDimensions.js';

describe('RefineMode interaction', () => {
  let tmpDir: string;
  let store: TaskStore;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-man-refinemode-'));
    store = new TaskStore(join(tmpDir, 'tasks.json'));
  });

  afterEach(() => {
    cleanup?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const render = () =>
    renderWithDimensions(
      createElement(RefineMode, {
        store: new LocalStore(store),
        reload: vi.fn(),
        onExit: vi.fn(),
        previousMode: 'focus',
      }),
    );

  // Regression: answering a card must not skip the next card in the same task.
  // A task missing only its vibe, unfocused → questions = [vibe, focus].
  // Answering vibe must land on the focus card, not race past it.
  it('does not skip the next question after answering one', async () => {
    // scope + time set, vibe null, has a category, unfocused, human-created:
    // yields exactly [vibe, focus] and is a candidate (no_vibe).
    await store.add({
      title: 'clean title',
      scope: 'personal',
      time_estimate: '20m',
      categories: ['home'],
      focused: false,
    });

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Vibe check?'), { timeout: 2000 });

    // Pick "ok" (option 2 of love/ok/dread).
    result.stdin.write('2');

    // The focus card must actually appear — the bug skipped straight past it
    // (and, with one task, jumped to REFINE COMPLETE).
    await vi.waitFor(
      () => expect(result.text()).toContain("Pull this into tomorrow's focus?"),
      { timeout: 2000 },
    );
    expect(result.text()).not.toContain('REFINE COMPLETE');
  });

  it('shows the empty state when nothing needs refine', async () => {
    // Fully-refined + focused = not a candidate → empty queue.
    await store.add({
      title: 'done-being-refined',
      scope: 'personal',
      time_estimate: '20m',
      vibe: 'ok',
      categories: ['home'],
      focused: true,
    });

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Nothing needs refine'), { timeout: 2000 });
  });
});
