import { generateInsight } from './insights.js';
import { getEndOfDayMessage } from './messages.js';
import type { Store } from './store-interface.js';
import { completedOn, createdOn, filterByScope, inProgressUpdatedOn } from './task-filters.js';
import { isOnLocalDate } from './local-date.js';
import type { DayReport, TaskScope } from './types.js';

export interface DayReportOptions {
  /** Restrict every number/list to one scope (web Metrics scope chip). */
  scope?: TaskScope;
}

// Loads the full task list once and derives everything else in-memory —
// generateInsight alone would otherwise re-query per-date up to ~380 times
// (streak + velocity-trend lookback), which is fine against a local file but
// would be ~380 sequential HTTP round-trips against a RemoteStore.
export async function buildDayReport(
  store: Store,
  date: string,
  opts: DayReportOptions = {},
): Promise<DayReport> {
  const loaded = await store.load();
  const allTasks = filterByScope(loaded, opts.scope);

  const allCompletedOn = completedOn(allTasks, date);
  const completedTasks = allCompletedOn.filter(t => t.parent_id === null);
  const inProgressTasks = inProgressUpdatedOn(allTasks, date);
  const startedTasks = createdOn(allTasks, date);

  const completedByHuman = completedTasks.filter(t => t.created_by === 'human').length;
  const completedByClaude = completedTasks.filter(t => t.created_by === 'claude').length;

  const totalRelevant = completedTasks.length + inProgressTasks.length;
  const completionRate = totalRelevant > 0
    ? Math.round((completedTasks.length / totalRelevant) * 100)
    : 0;

  // Subtask stats: count all subtasks and how many are done
  const allSubtasks = allTasks.filter(t => t.parent_id !== null);
  const subtasksCompleted = allSubtasks.filter(t => isOnLocalDate(t.completed_at, date)).length;
  const subtasksTotal = allSubtasks.length;

  // Insight stays a whole-day artifact: it's generated once per day and
  // dedupe state is persisted (insights-log). A scoped view must neither
  // show a misleading "record day!" computed on a slice nor write that
  // slice into the log — so scoped reports simply carry no insight.
  const insight = opts.scope ? null : generateInsight(allTasks, date);
  const encouragingMessage = getEndOfDayMessage();

  // Tasks still focused and not done — tomorrow's plan
  const tomorrowFocus = allTasks
    .filter(t => t.focused && t.status !== 'done' && t.parent_id === null)
    .sort((a, b) => {
      // in_progress first, then by priority
      if (a.status !== b.status) {
        return a.status === 'in_progress' ? -1 : 1;
      }
      const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    });

  return {
    date,
    completedTasks,
    inProgressTasks,
    startedTasks,
    tomorrowFocus,
    stats: {
      completed: completedTasks.length,
      completedByHuman,
      completedByClaude,
      started: startedTasks.length,
      inProgress: inProgressTasks.length,
      completionRate,
      subtasksCompleted,
      subtasksTotal,
    },
    insight,
    encouragingMessage,
  };
}
