import { generateInsight } from './insights.js';
import { getEndOfDayMessage } from './messages.js';
import { TaskStore } from './store.js';
import type { DayReport } from './types.js';

export function buildDayReport(store: TaskStore, date: string): DayReport {
  const completedTasks = store.getCompletedOn(date);
  const inProgressTasks = store.getInProgressUpdatedOn(date);
  const startedTasks = store.getCreatedOn(date);

  const completedByHuman = completedTasks.filter(t => t.created_by === 'human').length;
  const completedByClaude = completedTasks.filter(t => t.created_by === 'claude').length;

  const totalRelevant = completedTasks.length + inProgressTasks.length;
  const completionRate = totalRelevant > 0
    ? Math.round((completedTasks.length / totalRelevant) * 100)
    : 0;

  const insight = generateInsight(store, date);
  const encouragingMessage = getEndOfDayMessage();

  return {
    date,
    completedTasks,
    inProgressTasks,
    startedTasks,
    stats: {
      completed: completedTasks.length,
      completedByHuman,
      completedByClaude,
      started: startedTasks.length,
      inProgress: inProgressTasks.length,
      completionRate,
    },
    insight,
    encouragingMessage,
  };
}
