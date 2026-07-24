import type { Task, TaskScope } from './types.js';
import { filterByScope } from './task-filters.js';
import { missingAspects, MAX_QUESTIONS_PER_TASK } from './refine-aspects.js';
import type { AspectContext, QuestionDef } from './refine-aspects.js';

// The "question brain" for Refine. The aspect list (refine-aspects.ts) is the
// single source of truth; this module just derives the ordered cards for one
// task from it, plus the category-name helper (which needs filterByScope, kept
// out of the pure aspects core). Re-export the card types/helpers so existing
// importers keep their `from './refine-questions.js'` paths.
export {
  MAX_QUESTIONS_PER_TASK,
  COMMON_TYPOS,
  suggestTitleFix,
} from './refine-aspects.js';
export type {
  QuestionType,
  QuestionOption,
  QuestionDef,
  RefineReason,
} from './refine-aspects.js';

/**
 * The category names to offer during refine, derived identically by the TUI
 * and the web so the two never drift.
 *
 * - **Scoped**: only categories used within `scope` (undefined = all).
 * - **Case-deduped**: `aim` and `AIM` collapse to one — the casing that appears
 *   most often wins (ties → the lexicographically smaller casing).
 * - **Usage-ordered**: most-used first, so the quick-pick buttons surface the
 *   common ones and the long tail lives in the web's full dropdown.
 */
export function deriveCategories(tasks: Task[], scope?: TaskScope): string[] {
  const scoped = filterByScope(tasks, scope);
  const byKey = new Map<string, { count: number; casings: Map<string, number> }>();
  for (const t of scoped) {
    for (const c of t.categories) {
      const entry = byKey.get(c.toLowerCase()) ?? { count: 0, casings: new Map() };
      entry.count += 1;
      entry.casings.set(c, (entry.casings.get(c) ?? 0) + 1);
      byKey.set(c.toLowerCase(), entry);
    }
  }
  return [...byKey.values()]
    .map((e) => {
      let name = '';
      let best = -1;
      for (const [casing, n] of e.casings) {
        if (n > best || (n === best && casing < name)) {
          name = casing;
          best = n;
        }
      }
      return { name, count: e.count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((c) => c.name);
}

/**
 * Ordered question cards for one task, capped at MAX_QUESTIONS_PER_TASK. Thin
 * adapter over the aspect list: build the context, then map the task's missing
 * aspects to their cards, in aspect (ask) order.
 *
 * `focusWarnThreshold` is a soft advisory (see the focus aspect); `null` shows
 * no warning note (the web passes null). `suppressFocusQuestion` omits the
 * focus card — the "≤2 focus asks per session" budget is caller-enforced.
 */
export function buildQuestions(
  task: Task,
  allTasks: Task[],
  focusedCount: number,
  focusWarnThreshold: number | null,
  knownCategories: string[],
  suppressFocusQuestion = false,
): QuestionDef[] {
  const ctx: AspectContext = {
    // A category card only fires when there's a category to file under; the
    // scoped `knownCategories` the caller passes is exactly that set.
    anyCategoriesExist: knownCategories.length > 0,
    knownCategories,
    focusedCount,
    focusWarnThreshold,
    suppressFocus: suppressFocusQuestion,
    hasSubtasks: allTasks.some((t) => t.parent_id === task.id),
  };
  return missingAspects(task, ctx)
    .map((a) => a.buildCard(task, ctx))
    .slice(0, MAX_QUESTIONS_PER_TASK);
}
