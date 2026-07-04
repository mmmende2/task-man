import type { DayReport } from '../../types.js';

// Placeholder shown for the one render before the first async
// buildDayReport() resolves (TUI reads are async now that stores can be
// remote — see docs/phase1-technical-plan.md).
export const EMPTY_DAY_REPORT: DayReport = {
  date: '',
  completedTasks: [],
  inProgressTasks: [],
  startedTasks: [],
  tomorrowFocus: [],
  stats: {
    completed: 0,
    completedByHuman: 0,
    completedByClaude: 0,
    started: 0,
    inProgress: 0,
    completionRate: 0,
    subtasksCompleted: 0,
    subtasksTotal: 0,
  },
  insight: null,
  encouragingMessage: '',
};
