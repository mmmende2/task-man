import type { Store } from '../store-interface.js';
import type { MetricsResponse, Task } from '../types.js';
import { buildDayReport } from '../report.js';
import { localDateString } from '../local-date.js';

// Re-export so callers can `import { MetricsResponse } from 'task-man/handlers'`.
// The interface itself lives in types.ts (pure type module) so the web bundle
// can import the type without pulling this module's server-only deps.
export type { MetricsResponse } from '../types.js';

export async function buildMetrics(store: Store, date: string): Promise<MetricsResponse> {
  const report = await buildDayReport(store, date);
  const all = await store.load();

  // Parents with activity on `date`: parent done that day OR any of its
  // subtasks completed that day. Mirrors the TUI MetricsMode logic and the
  // "completedTasks ∪ inProgressTasks" set buildDayReport already produced.
  const activeParentIds = new Set<string>();
  for (const t of report.completedTasks) activeParentIds.add(t.id);
  for (const t of report.inProgressTasks) activeParentIds.add(t.id);
  for (const t of all) {
    if (t.parent_id && t.completed_at && localDateString(new Date(t.completed_at)) === date) {
      activeParentIds.add(t.parent_id);
    }
  }

  const subtasksByParent: Record<string, Task[]> = {};
  for (const t of all) {
    if (t.parent_id && activeParentIds.has(t.parent_id)) {
      (subtasksByParent[t.parent_id] ??= []).push(t);
    }
  }

  // lastWorkDay: scan distinct local-dates of any completion strictly before `date`.
  let lastWorkDay: string | null = null;
  for (const t of all) {
    if (!t.completed_at) continue;
    const d = localDateString(new Date(t.completed_at));
    if (d < date && (lastWorkDay === null || d > lastWorkDay)) {
      lastWorkDay = d;
    }
  }

  // earliestDate: min(created_at) across all tasks, in local time.
  let earliestDate: string | null = null;
  for (const t of all) {
    const d = localDateString(new Date(t.created_at));
    if (earliestDate === null || d < earliestDate) {
      earliestDate = d;
    }
  }

  return { ...report, subtasksByParent, lastWorkDay, earliestDate };
}
