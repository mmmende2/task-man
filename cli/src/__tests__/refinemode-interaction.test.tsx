import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Task } from '../types.js';
import { TaskStore } from '../store.js';
import { STALE_TODO_DAYS } from '../refine-queue.js';
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

  const render = (props: Partial<Parameters<typeof RefineMode>[0]> = {}) =>
    renderWithDimensions(
      createElement(RefineMode, {
        store: new LocalStore(store),
        reload: vi.fn(),
        onExit: vi.fn(),
        previousMode: 'focus',
        ...props,
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

    // Pick "ok" (option 2 of love/ok/dread) and confirm the focus card lands.
    // On the CI runner the first synchronous keystroke can race ink's
    // raw-mode input subscription and get dropped, so keep offering "2" until
    // the vibe answer registers. Re-sending is safe: "2" selects on the
    // number-type vibe card but is a no-op on the yes/no focus card (and is
    // ignored during the answer flash), so it can't over-advance.
    await vi.waitFor(
      () => {
        result.stdin.write('2');
        expect(result.text()).toContain("Pull this into tomorrow's focus?");
      },
      { timeout: 3000, interval: 60 },
    );
    // The focus card must actually appear — the bug this guards against
    // skipped straight past it (and, with one task, jumped to REFINE COMPLETE).
    expect(result.text()).not.toContain('REFINE COMPLETE');
  });

  it('queues only tasks matching the scopeFilter prop', async () => {
    // Both are refine candidates (missing vibe). Only the professional one
    // should be queued when the filter is professional.
    await store.add({ title: 'work-item', scope: 'professional', time_estimate: '20m', categories: ['work'], focused: true });
    await store.add({ title: 'home-item', scope: 'personal', time_estimate: '20m', categories: ['home'], focused: true });

    const result = render({ scopeFilter: 'professional' });
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('work-item'), { timeout: 2000 });
    expect(result.text()).not.toContain('home-item');
  });

  it('offers the focus card at most twice per session (cap of 2)', async () => {
    // Three tasks, each missing only vibe and unfocused → each yields
    // [vibe, focus]. The focus card is charged per task visited, so tasks 1
    // and 2 get it and task 3 must not — answering task 3's vibe should end
    // the session rather than surface a third focus card.
    for (const title of ['refine-one', 'refine-two', 'refine-three']) {
      await store.add({ title, scope: 'personal', time_estimate: '20m', categories: ['home'], focused: false });
    }

    const result = render();
    cleanup = result.cleanup;

    // Each stage spams a key that is a no-op once the target state is reached,
    // so a dropped first keystroke retries without over-advancing:
    //   '2' answers the number-type vibe card, no-op on the yes/no focus card.
    //   'f' skips the focus card, no-op (NaN) on the vibe card.

    // Task 1: answer vibe → focus card 1.
    await vi.waitFor(() => {
      result.stdin.write('2');
      expect(result.text()).toContain("Pull this into tomorrow's focus?");
    }, { timeout: 3000, interval: 60 });

    // Skip focus 1 → task 2's vibe card.
    await vi.waitFor(() => {
      result.stdin.write('f');
      expect(result.text()).toContain('refine-two');
      expect(result.text()).toContain('Vibe check?');
    }, { timeout: 3000, interval: 60 });

    // Task 2: answer vibe → focus card 2.
    await vi.waitFor(() => {
      result.stdin.write('2');
      expect(result.text()).toContain("Pull this into tomorrow's focus?");
    }, { timeout: 3000, interval: 60 });

    // Skip focus 2 → task 3's vibe card.
    await vi.waitFor(() => {
      result.stdin.write('f');
      expect(result.text()).toContain('refine-three');
      expect(result.text()).toContain('Vibe check?');
    }, { timeout: 3000, interval: 60 });

    // Task 3: answering vibe must complete the session — no third focus card.
    // If the cap were broken, a focus card would appear here and '2' (a no-op
    // on it) would never reach REFINE COMPLETE, timing the test out.
    await vi.waitFor(() => {
      result.stdin.write('2');
      expect(result.text()).toContain('REFINE COMPLETE');
    }, { timeout: 3000, interval: 60 });
    expect(result.text()).not.toContain("Pull this into tomorrow's focus?");
  });

  // Regression: a parent re-render (InteractiveApp polls the store every 2s and
  // passes a fresh onExit=switchMode each time) must NOT re-run the freeze
  // effect and bounce the session back to question 0. The bug made cards flash
  // past and jump on their own, with no input.
  it('does not reset the question flow when the parent re-renders (fresh onExit)', async () => {
    // Yields [vibe, focus]. We *skip* the vibe question (leaving it unanswered
    // and still live at index 0) so a re-freeze would visibly reset us to it.
    await store.add({
      title: 'clean title', scope: 'personal', time_estimate: '20m',
      categories: ['home'], focused: false,
    });

    const localStore = new LocalStore(store);
    const reload = vi.fn();
    const mk = (onExit: () => void) =>
      createElement(RefineMode, { store: localStore, reload, onExit, previousMode: 'focus' as const });

    const result = renderWithDimensions(mk(vi.fn()));
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Vibe check?'), { timeout: 2000 });

    // Skip the vibe question ('n') → land on the focus card. Only press while
    // the vibe card is showing, so we can't over-skip into the focus card.
    await vi.waitFor(() => {
      if (result.text().includes('Vibe check?')) result.stdin.write('n');
      expect(result.text()).toContain("Pull this into tomorrow's focus?");
    }, { timeout: 3000, interval: 60 });

    // Simulate several parent re-renders, each with a brand-new onExit.
    for (let i = 0; i < 3; i++) result.rerender(mk(vi.fn()));
    // Give any (erroneous) freeze re-run time to fire.
    await new Promise((r) => setTimeout(r, 120));

    // Still on the focus card — not bounced back to the unanswered vibe card.
    expect(result.text()).toContain("Pull this into tomorrow's focus?");
    expect(result.text()).not.toContain('Vibe check?');
  });

  // Regression: the ✓ flash must appear immediately on answer, not after the
  // store write resolves — awaiting the write first re-rendered the card
  // untouched for the write's duration (list cursor snapped back to the top),
  // reading as the answer being visually reset. A never-resolving update()
  // makes the old ordering hang the flash forever.
  it('flashes the answer before the store write resolves', async () => {
    await store.add({
      title: 'clean title', scope: 'personal', time_estimate: '20m',
      categories: ['home'], focused: true,
    });
    const hung = new LocalStore(store);
    hung.update = () => new Promise<never>(() => {});

    const result = render({ store: hung });
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Vibe check?'), { timeout: 2000 });
    await vi.waitFor(() => {
      result.stdin.write('2');
      expect(result.text()).toContain('✓ vibe: ok');
    }, { timeout: 3000, interval: 60 });
  });

  // Regression: stale high-priority refined tasks were queued (stale_todo)
  // but built ZERO cards — the priority card is gated off for already-high
  // tasks and their focus card dies once the 2-ask budget is spent. Each
  // zero-card task was auto-advanced, chaining into a no-input fast-forward
  // through the rest of the queue ("cards flash past on their own"). With the
  // gates shared (isStaleTodo), such tasks never enter the queue at all.
  it('does not queue stale high-priority tasks that have nothing to ask', async () => {
    for (let i = 1; i <= 6; i++) {
      await store.add({
        title: `stale-${i}`, scope: 'personal', time_estimate: '20m', vibe: 'ok',
        categories: ['home'], focused: false, priority: 'high',
      });
    }
    // Backdate them past the staleness threshold.
    const tasksPath = join(tmpDir, 'tasks.json');
    const raw = JSON.parse(readFileSync(tasksPath, 'utf-8')) as Task[];
    const old = new Date(Date.now() - (STALE_TODO_DAYS + 10) * 24 * 3600 * 1000).toISOString();
    for (const t of raw) t.created_at = old;
    writeFileSync(tasksPath, JSON.stringify(raw, null, 2));

    const result = render();
    cleanup = result.cleanup;

    await vi.waitFor(() => expect(result.text()).toContain('Nothing needs refine'), { timeout: 2000 });
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
