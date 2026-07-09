import { describe, it, expect } from 'vitest';
import {
  isRefineCandidate,
  buildRefineCandidates,
  buildRefineQueue,
  countUnrefined,
  buildRefineQueueWithReasons,
} from '../refine-queue.js';
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
