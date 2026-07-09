import { describe, it, expect } from 'vitest';
import { buildQuestions, suggestTitleFix, MAX_QUESTIONS_PER_TASK } from '../refine-questions.js';
import type { Task } from '../types.js';

// A fully-refined human task: no scope gap, has time + vibe, has a category,
// already focused, recent. Nothing should be asked about it. Individual
// tests peel back one field at a time to trigger exactly one card.
function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: 'task-1',
    title: 'Refined task',
    description: 'has a description',
    status: 'todo',
    priority: 'medium',
    scope: 'personal',
    categories: ['inbox'],
    parent_id: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    focused: true,
    created_by: 'human',
    session_id: null,
    time_estimate: '20m',
    vibe: 'ok',
    ...overrides,
  };
}

const prompts = (t: Task, focusedCount = 0, threshold: number | null = null, cats: string[] = []) =>
  buildQuestions(t, [t], focusedCount, threshold, cats).map((q) => q.prompt);

describe('suggestTitleFix', () => {
  it('trims surrounding whitespace', () => {
    expect(suggestTitleFix('  ship it  ')).toBe('ship it');
  });

  it('fixes common typos', () => {
    expect(suggestTitleFix('email teh client')).toBe('email the client');
    expect(suggestTitleFix('recieve package')).toBe('receive package');
  });

  it('sentence-cases shouty titles', () => {
    expect(suggestTitleFix('DEPLOY THE THING')).toBe('Deploy the thing');
  });

  it('returns null when nothing needs fixing', () => {
    expect(suggestTitleFix('a clean title')).toBeNull();
  });
});

describe('buildQuestions', () => {
  it('asks nothing about a fully-refined human task', () => {
    expect(prompts(makeTask())).toEqual([]);
  });

  it('offers a correction card for a typo, first', () => {
    const qs = buildQuestions(makeTask({ title: 'fix teh bug' }), [], 0, null, []);
    expect(qs[0].type).toBe('correction');
    expect(qs[0].suggestion).toBe('fix the bug');
  });

  it('asks time when the estimate is missing', () => {
    expect(prompts(makeTask({ time_estimate: null }))).toContain('How long will this take?');
  });

  it('asks vibe when the vibe is missing', () => {
    expect(prompts(makeTask({ vibe: null }))).toContain('Vibe check?');
  });

  it('reviews priority on a stale todo', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(prompts(makeTask({ created_at: old, priority: 'low' }))).toContain('How urgent is this, really?');
  });

  it('offers the focus card for an unfocused task', () => {
    expect(prompts(makeTask({ focused: false }))).toContain("Pull this into tomorrow's focus?");
  });

  it('always offers the focus card even past the warn threshold — no hard limit', () => {
    const qs = buildQuestions(makeTask({ focused: false }), [], 5, 3, []);
    const focus = qs.find((q) => q.prompt.startsWith('Pull this'));
    expect(focus).toBeDefined();
    expect(focus!.note).toMatch(/already 5 focused/);
  });

  it('adds no warning note when under the threshold', () => {
    const qs = buildQuestions(makeTask({ focused: false }), [], 1, 3, []);
    const focus = qs.find((q) => q.prompt.startsWith('Pull this'));
    expect(focus!.note).toBeUndefined();
  });

  it('adds no warning note when the threshold is null (web has no config)', () => {
    const qs = buildQuestions(makeTask({ focused: false }), [], 99, null, []);
    const focus = qs.find((q) => q.prompt.startsWith('Pull this'));
    expect(focus!.note).toBeUndefined();
  });

  it('offers a category card when the task has none and categories are known', () => {
    expect(prompts(makeTask({ categories: [] }), 0, null, ['work', 'home'])).toContain('File this under...?');
  });

  it('omits the focus card when suppressFocusQuestion is set, leaving other cards intact', () => {
    // Unfocused + missing vibe → normally [vibe, focus]. Suppressing drops
    // only the focus card; the vibe card and the slice are undisturbed.
    const task = makeTask({ focused: false, vibe: null });
    const normal = buildQuestions(task, [task], 0, null, []).map((q) => q.prompt);
    expect(normal).toContain('Vibe check?');
    expect(normal).toContain("Pull this into tomorrow's focus?");

    const suppressed = buildQuestions(task, [task], 0, null, [], true).map((q) => q.prompt);
    expect(suppressed).toContain('Vibe check?');
    expect(suppressed).not.toContain("Pull this into tomorrow's focus?");
  });

  it('leads a blank Claude task with scope, time, and vibe (cap keeps later cards out)', () => {
    // The "does it belong?" confirm card only fires for a no-engagement
    // Claude task — but such a task already trips scope + time + vibe, which
    // fill all three slots first. So the earliest, highest-signal cards win.
    const claudeTask = makeTask({
      created_by: 'claude',
      description: null,
      categories: [],
      focused: false,
      time_estimate: null,
      vibe: null,
    });
    expect(prompts(claudeTask)).toEqual([
      'Work thing or personal thing?',
      'How long will this take?',
      'Vibe check?',
    ]);
  });

  it('caps the question list at MAX_QUESTIONS_PER_TASK', () => {
    // A blank Claude task trips nearly every card; the list must still be capped.
    const messy = makeTask({
      title: 'teh thing',
      created_by: 'claude',
      description: null,
      categories: [],
      focused: false,
      scope: 'personal',
      time_estimate: null,
      vibe: null,
    });
    const qs = buildQuestions(messy, [], 0, 3, ['work', 'home']);
    expect(qs.length).toBeLessThanOrEqual(MAX_QUESTIONS_PER_TASK);
  });
});
