import type { Task, TaskPriority } from './types.js';

const MAX_TASKS = 20;

/** Days a todo can sit untouched before refine flags it as stale. */
export const STALE_TODO_DAYS = 30;

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export type RefineReason =
  | 'no_scope'
  | 'from_claude'
  | 'stale_todo'
  | 'no_time_estimate'
  | 'no_vibe'
  | 'no_category';

export interface RefineCandidate {
  task: Task;
  reasons: RefineReason[];
}

/**
 * Does this task warrant the "How urgent is this, really?" review because it
 * has gone stale? Already-high tasks are exempt — their urgency is answered.
 *
 * Shared by isRefineCandidate (stale_todo reason) and buildQuestions (the
 * priority card) so the two gates can never drift. The queue/questions
 * invariant this protects: every reason that admits a task to the refine
 * queue must map to a card buildQuestions will actually ask. A queued task
 * with zero cards is auto-skipped by the session (qs.length === 0 →
 * advanceTask in RefineMode/Refine.tsx), and once the focus-ask budget is
 * spent those skips chain — the TUI visibly fast-forwards through the rest
 * of the queue with no input.
 */
export function isStaleTodo(t: Task): boolean {
  return t.status === 'todo' && daysSince(t.created_at) > STALE_TODO_DAYS && t.priority !== 'high';
}

/**
 * A Claude-created task still warrants an origin review until the user has
 * given it the core metadata. "Refined" = both a time estimate AND a vibe are
 * set; until then the `from_claude` queue reason and the priority card stay
 * live, and once refined they clear so Refine stops re-asking.
 *
 * This exists because `created_by === 'claude'` is permanent and `priority`
 * always has a value (defaults to 'medium'), so nothing else could tell "this
 * Claude task was already reviewed" apart. Shared by isRefineCandidate (the
 * `from_claude` reason) and buildQuestions (the priority card) so the queue and
 * the cards use one definition and can't drift.
 */
export function needsClaudeRefine(t: Task): boolean {
  return t.created_by === 'claude' && (t.time_estimate == null || t.vibe == null);
}

/**
 * Reasons a single task needs refinement (empty = doesn't).
 *
 * `anyCategoriesExist` gates the `no_category` reason and mirrors the
 * category-question gating in refine-questions.ts (a category card only
 * appears when some category exists to file under). Without it, a store with
 * zero categories anywhere would flag every task while producing queue
 * entries that have no askable category question. Defaults to `true` so
 * ad-hoc single-task callers keep the old behavior when they don't pass it.
 */
export function isRefineCandidate(
  t: Task,
  opts?: { anyCategoriesExist?: boolean },
): RefineReason[] {
  if (t.parent_id) return [];
  if (t.status === 'done') return [];
  const reasons: RefineReason[] = [];
  if (!t.scope) reasons.push('no_scope');
  if (needsClaudeRefine(t)) reasons.push('from_claude');
  if (isStaleTodo(t)) reasons.push('stale_todo');
  if (t.time_estimate == null) reasons.push('no_time_estimate');
  if (t.vibe == null) reasons.push('no_vibe');
  if (t.categories.length === 0 && (opts?.anyCategoriesExist ?? true)) reasons.push('no_category');
  return reasons;
}

/**
 * All refine candidates, priority-sorted (high → medium → low, then oldest
 * first) — the honest, UNcapped list. `buildRefineQueue` slices this for a
 * bounded TUI session; `countUnrefined` measures it.
 */
export function buildRefineCandidates(tasks: Task[]): Task[] {
  const anyCategoriesExist = tasks.some(t => t.categories.length > 0);
  const candidates = tasks.filter(t => isRefineCandidate(t, { anyCategoriesExist }).length > 0);

  const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    return a.created_at.localeCompare(b.created_at);
  });

  return candidates;
}

/** Uncapped total of tasks that need refinement. */
export function countUnrefined(tasks: Task[]): number {
  return buildRefineCandidates(tasks).length;
}

/** Bounded queue for a single TUI refine session (capped at MAX_TASKS). */
export function buildRefineQueue(tasks: Task[]): Task[] {
  return buildRefineCandidates(tasks).slice(0, MAX_TASKS);
}

export function buildRefineQueueWithReasons(tasks: Task[]): RefineCandidate[] {
  // Same anyCategoriesExist flag the filter used, so reasons agree with it.
  const anyCategoriesExist = tasks.some(t => t.categories.length > 0);
  return buildRefineQueue(tasks).map(task => ({
    task,
    reasons: isRefineCandidate(task, { anyCategoriesExist }),
  }));
}
