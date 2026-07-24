import type { Task, TaskPriority } from './types.js';
import { baseCtx, missingAspects } from './refine-aspects.js';
import type { RefineReason } from './refine-aspects.js';

// Queue derivations over the aspect list (single source in refine-aspects.ts).
// Re-export the shared predicates/constants so existing importers (tests, the
// TUI) keep their `from './refine-queue.js'` paths.
export { STALE_TODO_DAYS, isStaleTodo, needsClaudeReview, isRefined } from './refine-aspects.js';
export type { RefineReason } from './refine-aspects.js';

const MAX_TASKS = 20;

export interface RefineCandidate {
  task: Task;
  reasons: RefineReason[];
}

/**
 * Reasons a single task needs refinement (empty = doesn't). Derived from the
 * aspect list: a task is a candidate for its missing `gap` and `review`
 * aspects. `ride_along` aspects (title fix, "does it belong?", focus) never
 * admit a task to the queue on their own — they only appear on a task already
 * queued for a real reason.
 *
 * `anyCategoriesExist` gates the `no_category` reason (a category card only
 * appears when some category exists to file under); defaults true so ad-hoc
 * single-task callers keep the old behavior.
 */
export function isRefineCandidate(
  t: Task,
  opts?: { anyCategoriesExist?: boolean },
): RefineReason[] {
  if (t.parent_id) return [];
  if (t.status === 'done') return [];
  const ctx = baseCtx(opts?.anyCategoriesExist ?? true);
  return missingAspects(t, ctx)
    .filter((a) => a.kind === 'gap' || a.kind === 'review')
    .map((a) => a.reason);
}

/**
 * All refine candidates, priority-sorted (high → medium → low, then oldest
 * first) — the honest, UNcapped list.
 */
export function buildRefineCandidates(tasks: Task[]): Task[] {
  const anyCategoriesExist = tasks.some((t) => t.categories.length > 0);
  const candidates = tasks.filter((t) => isRefineCandidate(t, { anyCategoriesExist }).length > 0);

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

/** Bounded queue for a single refine session (capped at MAX_TASKS). */
export function buildRefineQueue(tasks: Task[]): Task[] {
  return buildRefineCandidates(tasks).slice(0, MAX_TASKS);
}

export function buildRefineQueueWithReasons(tasks: Task[]): RefineCandidate[] {
  const anyCategoriesExist = tasks.some((t) => t.categories.length > 0);
  return buildRefineQueue(tasks).map((task) => ({
    task,
    reasons: isRefineCandidate(task, { anyCategoriesExist }),
  }));
}
