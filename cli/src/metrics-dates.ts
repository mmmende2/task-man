import type { Task } from './types.js';
import { localDateString } from './local-date.js';

// Task-typed date helpers shared by the metrics handler and the TUI Metrics
// mode. Kept separate from local-date.ts (which is Task-agnostic and safe for
// the web bundle) and from the report machinery (which the TUI shouldn't pull
// in just to compute a day).

/**
 * The most recent local date, strictly before `beforeDate`, on which any task
 * in `tasks` was completed — or null if none. Callers pass an already
 * scope-filtered list when they want a scoped "last work day".
 */
export function computeLastWorkDay(tasks: Task[], beforeDate: string): string | null {
  let lastWorkDay: string | null = null;
  for (const t of tasks) {
    if (!t.completed_at) continue;
    const d = localDateString(new Date(t.completed_at));
    if (d < beforeDate && (lastWorkDay === null || d > lastWorkDay)) {
      lastWorkDay = d;
    }
  }
  return lastWorkDay;
}

/** The earliest local `created_at` date across `tasks`, or null if empty. */
export function computeEarliestDate(tasks: Task[]): string | null {
  let earliestDate: string | null = null;
  for (const t of tasks) {
    const d = localDateString(new Date(t.created_at));
    if (earliestDate === null || d < earliestDate) {
      earliestDate = d;
    }
  }
  return earliestDate;
}
