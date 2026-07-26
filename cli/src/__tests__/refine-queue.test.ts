import { describe, it, expect } from 'vitest';
import {
  isRefineCandidate,
  buildRefineCandidates,
  buildRefineQueue,
  countUnrefined,
  buildRefineQueueWithReasons,
  needsClaudeReview,
} from '../refine-queue.js';
import { buildQuestions, deriveCategories } from '../refine-questions.js';
import type { Task } from '../types.js';

// A fully-refined, non-candidate task: has scope, human-made, has time/vibe,
// has a category, fresh. Override to introduce a single refine reason.
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: Math.random().toString(36).slice(2),
    title: 'clean',
    description: null,
    status: 'todo',
    priority: 'medium',
    scope: 'personal',
    categories: ['home'],
    parent_id: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    focused: false,
    created_by: 'human',
    session_id: null,
    time_estimate: '20m',
    vibe: 'ok',
    owner: null,
    ...overrides,
  } as Task;
}

describe('isRefineCandidate — no_category', () => {
  it('fires when categories are empty and some category exists in the set', () => {
    const reasons = isRefineCandidate(makeTask({ categories: [] }), { anyCategoriesExist: true });
    expect(reasons).toContain('no_category');
  });

  it('does NOT fire when no category exists anywhere', () => {
    const reasons = isRefineCandidate(makeTask({ categories: [] }), { anyCategoriesExist: false });
    expect(reasons).not.toContain('no_category');
  });

  it('does NOT fire for a task that already has a category', () => {
    const reasons = isRefineCandidate(makeTask({ categories: ['home'] }), { anyCategoriesExist: true });
    expect(reasons).not.toContain('no_category');
  });

  it('defaults anyCategoriesExist to true for ad-hoc callers', () => {
    expect(isRefineCandidate(makeTask({ categories: [] }))).toContain('no_category');
  });
});

describe('isRefineCandidate — a stale todo is never a queue reason', () => {
  const old = '2020-01-01T00:00:00.000Z';

  // Refine exists to capture metadata we don't have. Staleness is a recurring
  // condition, not a gap, and it has no "answered" state to reach — so it rides
  // along on tasks queued for a real gap and never queues one itself. See the
  // ride-along tests in refine-aspects.test.ts for the card-level behavior.
  it('does NOT flag an untouched non-high todo that is otherwise refined', () => {
    expect(isRefineCandidate(makeTask({ updated_at: old }))).toHaveLength(0);
  });

  it('does NOT flag an untouched high-priority todo either', () => {
    expect(isRefineCandidate(makeTask({ updated_at: old, priority: 'high' }))).toHaveLength(0);
  });

  it('an untouched todo WITH a gap queues for the gap alone', () => {
    const reasons = isRefineCandidate(makeTask({ updated_at: old, vibe: null }));
    expect(reasons).toEqual(['no_vibe']);
  });
});

describe('queue ↔ questions invariant', () => {
  // Regression for the "cards flash past on their own" cascade: every task
  // the queue admits must yield at least one card from buildQuestions — even
  // with the focus ask suppressed (budget spent), since focus is not a queue
  // reason. A queued task with zero cards is auto-advanced by the session,
  // and those skips chain into an unanswerable fast-forward.
  it('every queued task yields at least one card with the focus ask suppressed', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const tasks = [
      makeTask({ title: 'refined' }),
      makeTask({ title: 'stale-high', updated_at: old, priority: 'high' }),
      makeTask({ title: 'stale-low', updated_at: old, priority: 'low' }),
      makeTask({ title: 'no-vibe', vibe: null }),
      makeTask({ title: 'no-time', time_estimate: null }),
      makeTask({ title: 'no-cat', categories: [] }),
      makeTask({ title: 'from-claude', created_by: 'claude' }),
      makeTask({ title: 'claude-unrefined', created_by: 'claude', time_estimate: null, vibe: null }),
    ];
    const queued = buildRefineCandidates(tasks);

    // Neither stale task has a gap, so neither queues — staleness is a
    // ride-along, not a queue reason.
    expect(queued.map((t) => t.title)).not.toContain('stale-high');
    expect(queued.map((t) => t.title)).not.toContain('stale-low');
    expect(queued.length).toBeGreaterThan(0);

    const cats = deriveCategories(tasks);
    for (const t of queued) {
      const qs = buildQuestions(t, tasks, 0, null, cats, /* suppressFocusQuestion */ true);
      expect(qs.length, `queued task "${t.title}" built zero cards`).toBeGreaterThan(0);
    }
  });
});

describe('buildRefineCandidates set membership', () => {
  it('no_category only flags a store where some category exists', () => {
    // Every task uncategorized → no_category must NOT be the flag; these are
    // otherwise fully refined, so nothing is a candidate.
    const noneHaveCats = [
      makeTask({ categories: [] }),
      makeTask({ categories: [] }),
    ];
    expect(buildRefineCandidates(noneHaveCats)).toHaveLength(0);

    // One task carries a category → the uncategorized ones become candidates.
    const oneHasCat = [
      makeTask({ categories: ['work'] }),
      makeTask({ categories: [] }),
      makeTask({ categories: [] }),
    ];
    expect(buildRefineCandidates(oneHasCat)).toHaveLength(2);
  });

  it('excludes subtasks and done tasks', () => {
    const tasks = [
      makeTask({ vibe: null }),                       // candidate
      makeTask({ vibe: null, parent_id: 'p1' }),      // subtask — excluded
      makeTask({ vibe: null, status: 'done' }),       // done — excluded
    ];
    expect(buildRefineCandidates(tasks)).toHaveLength(1);
  });

  it('sorts high → medium → low, then oldest first', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const newer = '2024-01-01T00:00:00.000Z';
    const low = makeTask({ priority: 'low', vibe: null, created_at: newer });
    const medNew = makeTask({ priority: 'medium', vibe: null, created_at: newer });
    const medOld = makeTask({ priority: 'medium', vibe: null, created_at: old });
    const high = makeTask({ priority: 'high', vibe: null, created_at: newer });
    const sorted = buildRefineCandidates([low, medNew, medOld, high]);
    expect(sorted.map((t) => t.priority)).toEqual(['high', 'medium', 'medium', 'low']);
    // Within medium, the older one comes first.
    expect(sorted[1].created_at).toBe(old);
  });
});

describe('countUnrefined vs buildRefineQueue cap', () => {
  it('countUnrefined is uncapped while buildRefineQueue caps at 20', () => {
    const tasks = Array.from({ length: 25 }, () => makeTask({ vibe: null }));
    expect(countUnrefined(tasks)).toBe(25);
    expect(buildRefineQueue(tasks)).toHaveLength(20);
  });
});

describe('needsClaudeReview — glance-once on brand-new Claude tasks', () => {
  const SCOPE_PROMPT = 'Work thing or personal thing?';
  const PRIORITY_PROMPT = 'How urgent is this, really?';

  it('predicate: true ONLY for a brand-new Claude task (no time estimate AND no vibe)', () => {
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: null, vibe: null }))).toBe(true);
    // Any engagement clears it — reviews are glance-once, never re-asked.
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: '20m', vibe: null }))).toBe(false);
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: null, vibe: 'ok' }))).toBe(false);
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: '20m', vibe: 'ok' }))).toBe(false);
    // Never fires on a human task.
    expect(needsClaudeReview(makeTask({ created_by: 'human', time_estimate: null, vibe: null }))).toBe(false);
  });

  it('a brand-new Claude task is queued for scope_review and priority_review', () => {
    const reasons = isRefineCandidate(
      makeTask({ created_by: 'claude', time_estimate: null, vibe: null }),
      { anyCategoriesExist: true },
    );
    expect(reasons).toContain('scope_review');
    expect(reasons).toContain('priority_review');
  });

  it('once engaged, the Claude reviews clear — only the remaining gap keeps it queued', () => {
    const reasons = isRefineCandidate(
      makeTask({ created_by: 'claude', time_estimate: '20m', vibe: null }),
      { anyCategoriesExist: true },
    );
    expect(reasons).not.toContain('scope_review');
    expect(reasons).not.toContain('priority_review');
    expect(reasons).toContain('no_vibe');
  });

  it('a refined Claude task drops out of the queue entirely', () => {
    const reasons = isRefineCandidate(
      makeTask({ created_by: 'claude', time_estimate: '20m', vibe: 'ok' }),
      { anyCategoriesExist: true },
    );
    expect(reasons).toHaveLength(0);
  });

  it('shows the scope review on a brand-new Claude task, and never again once engaged', () => {
    const fresh = makeTask({ created_by: 'claude', time_estimate: null, vibe: null, categories: [] });
    const freshPrompts = buildQuestions(fresh, [fresh], 0, null, [], true).map(q => q.prompt);
    expect(freshPrompts).toContain(SCOPE_PROMPT);

    const engaged = makeTask({ created_by: 'claude', time_estimate: '20m', vibe: null, categories: [] });
    const engagedPrompts = buildQuestions(engaged, [engaged], 0, null, [], true).map(q => q.prompt);
    expect(engagedPrompts).not.toContain(SCOPE_PROMPT);
  });

  it('does NOT show scope/priority review once a Claude task is refined', () => {
    const task = makeTask({ created_by: 'claude', time_estimate: '20m', vibe: 'ok' });
    const prompts = buildQuestions(task, [task], 0, null, ['home'], true).map(q => q.prompt);
    expect(prompts).not.toContain(SCOPE_PROMPT);
    expect(prompts).not.toContain(PRIORITY_PROMPT);
  });

  it('still offers the priority card for a stale non-Claude todo (ride-along trigger)', () => {
    const task = makeTask({ created_by: 'human', updated_at: '2020-01-01T00:00:00.000Z', priority: 'low' });
    const prompts = buildQuestions(task, [task], 0, null, ['home'], true).map(q => q.prompt);
    expect(prompts).toContain(PRIORITY_PROMPT);
    // ...but offering is not queueing.
    expect(isRefineCandidate(task, { anyCategoriesExist: true })).toHaveLength(0);
  });
});

describe('buildRefineQueueWithReasons', () => {
  it('reasons agree with the filter (no_category gated by the same flag)', () => {
    const tasks = [
      makeTask({ categories: ['work'] }),   // refined, not a candidate
      makeTask({ categories: [] }),         // candidate via no_category
    ];
    const withReasons = buildRefineQueueWithReasons(tasks);
    expect(withReasons).toHaveLength(1);
    expect(withReasons[0].reasons).toContain('no_category');
  });
});
