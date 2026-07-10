import type { Store } from '../store-interface.js';
import type { MetricsResponse, Task, TaskScope } from '../types.js';
import { buildDayReport } from '../report.js';
import { filterByScope } from '../task-filters.js';
import { localDateString } from '../local-date.js';
import { computeLastWorkDay, computeEarliestDate } from '../metrics-dates.js';

// Re-export so callers can `import { MetricsResponse } from 'task-man/handlers'`.
// The interface itself lives in types.ts (pure type module) so the web bundle
// can import the type without pulling this module's server-only deps.
export type { MetricsResponse } from '../types.js';

export async function buildMetrics(
  store: Store,
  date: string,
  scope?: TaskScope,
): Promise<MetricsResponse> {
  const report = await buildDayReport(store, date, { scope });
  const loaded = await store.load();
  // Same slice the report was built from — keeps subtask trees, lastWorkDay
  // ("last day with a completion IN THIS SCOPE"), and earliestDate coherent
  // with the scoped numbers.
  const all = filterByScope(loaded, scope);

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

  // The parent rows the web should render: every active parent, including a
  // `todo` parent whose only activity was a completed subtask (activeParentIds
  // already captures that case; completedTasks ∪ inProgressTasks does not).
  const activeParents = all.filter((t) => t.parent_id === null && activeParentIds.has(t.id));

  // lastWorkDay: most recent completion strictly before `date` (in scope).
  const lastWorkDay = computeLastWorkDay(all, date);
  // earliestDate: min(created_at) across all tasks, in local time.
  const earliestDate = computeEarliestDate(all);

  return { ...report, activeParents, subtasksByParent, lastWorkDay, earliestDate };
}
