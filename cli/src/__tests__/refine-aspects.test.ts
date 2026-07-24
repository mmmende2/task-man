import { describe, it, expect } from 'vitest';
import {
  ASPECTS,
  missingAspects,
  isRefined,
  needsClaudeReview,
  baseCtx,
  type AspectContext,
} from '../refine-aspects.js';
import { isRefineCandidate } from '../refine-queue.js';
import type { Task } from '../types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 'x',
    title: 'clean title',
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

const fullCtx = (o: Partial<AspectContext> = {}): AspectContext => ({ ...baseCtx(true), ...o });

describe('isRefined — all gaps filled', () => {
  it('true when time + vibe set and a category present', () => {
    expect(isRefined(makeTask(), { anyCategoriesExist: true })).toBe(true);
  });

  it('false on each single gap', () => {
    expect(isRefined(makeTask({ time_estimate: null }), { anyCategoriesExist: true })).toBe(false);
    expect(isRefined(makeTask({ vibe: null }), { anyCategoriesExist: true })).toBe(false);
    expect(isRefined(makeTask({ categories: [] }), { anyCategoriesExist: true })).toBe(false);
  });

  it('the category gap does not count when no category exists anywhere', () => {
    expect(isRefined(makeTask({ categories: [] }), { anyCategoriesExist: false })).toBe(true);
  });

  it('a typo title or being unfocused does NOT make a task unrefined (ride-alongs never count)', () => {
    expect(isRefined(makeTask({ title: 'fix teh bug', focused: false }), { anyCategoriesExist: true })).toBe(true);
  });
});

describe('needsClaudeReview — strictly Claude + brand-new', () => {
  it('true only for a Claude task with no time estimate and no vibe', () => {
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: null, vibe: null }))).toBe(true);
    expect(needsClaudeReview(makeTask({ created_by: 'human', time_estimate: null, vibe: null }))).toBe(false);
    expect(needsClaudeReview(makeTask({ created_by: 'claude', time_estimate: '20m', vibe: null }))).toBe(false);
  });
});

describe('missingAspects — ask order', () => {
  it('returns aspects as a subsequence of the canonical ASPECTS order, gaps before reviews', () => {
    const t = makeTask({
      created_by: 'claude',
      title: 'fix teh bug',
      description: null,
      categories: [],
      focused: false,
      time_estimate: null,
      vibe: null,
    });
    const order = missingAspects(t, fullCtx({ knownCategories: ['home'] })).map((a) => a.reason);
    const canonical = ASPECTS.map((a) => a.reason);
    let i = -1;
    for (const r of order) {
      const next = canonical.indexOf(r, i + 1);
      expect(next).toBeGreaterThan(i);
      i = next;
    }
    expect(order[0]).toBe('title_fix');
    expect(order.indexOf('no_time_estimate')).toBeLessThan(order.indexOf('scope_review'));
  });
});

describe('ride-along aspects never admit a task to the queue', () => {
  it('a refined task with only a typo + unfocused offers cards but has no queue reasons', () => {
    const t = makeTask({ title: 'fix teh bug', focused: false }); // otherwise fully refined
    const offered = missingAspects(t, fullCtx()).map((a) => a.reason);
    expect(offered).toEqual(expect.arrayContaining(['title_fix', 'focus']));
    expect(isRefineCandidate(t, { anyCategoriesExist: true })).toHaveLength(0);
  });
});

describe('every card carries its aspect reason (routing key)', () => {
  it('buildCard output.reason matches the aspect reason', () => {
    const t = makeTask({
      created_by: 'claude',
      title: 'fix teh bug',
      description: null,
      categories: [],
      focused: false,
      time_estimate: null,
      vibe: null,
    });
    for (const a of ASPECTS) {
      expect(a.buildCard(t, fullCtx({ knownCategories: ['home'] })).reason).toBe(a.reason);
    }
  });
});
