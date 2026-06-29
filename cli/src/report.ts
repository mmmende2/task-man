import { generateInsight } from './insights.js';
import { getEndOfDayMessage } from './messages.js';
import { TaskStore } from './store.js';
import { isOnLocalDate } from './local-date.js';
import type { DayReport } from './types.js';

export function buildDayReport(store: TaskStore, date: string): DayReport {
  const allCompletedOn = store.getCompletedOn(date);
  const completedTasks = allCompletedOn.filter(t => t.parent_id === null);
  const inProgressTasks = store.getInProgressUpdatedOn(date);
  const startedTasks = store.getCreatedOn(date);

  const completedByHuman = completedTasks.filter(t => t.created_by === 'human').length;
  const completedByClaude = completedTasks.filter(t => t.created_by === 'claude').length;

  const totalRelevant = completedTasks.length + inProgressTasks.length;
  const completionRate = totalRelevant > 0
    ? Math.round((completedTasks.length / totalRelevant) * 100)
    : 0;

  // Subtask stats: count all subtasks and how many are done
  const allTasks = store.load();
  const allSubtasks = allTasks.filter(t => t.parent_id !== null);
  const subtasksCompleted = allSubtasks.filter(t => isOnLocalDate(t.completed_at, date)).length;
  const subtasksTotal = allSubtasks.length;

  const insight = generateInsight(store, date);
  const encouragingMessage = getEndOfDayMessage();

  // Tasks still focused and not done — tomorrow's plan
  const tomorrowFocus = store.query({ focused: true })
    .filter(t => t.status !== 'done' && t.parent_id === null)
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
