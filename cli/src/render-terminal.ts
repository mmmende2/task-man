import chalk from 'chalk';
import { PRIORITY_COLORS, SESSION_COLORS, STATUS_COLORS } from './constants.js';
import { loadConfig } from './config.js';
import { isLocalToday } from './local-date.js';
import type { DayReport, SessionColor, Task } from './types.js';

function buildSubtaskMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id) {
      const arr = map.get(t.parent_id) ?? [];
      arr.push(t);
      map.set(t.parent_id, arr);
    }
  }
  return map;
}

function mdSubtask(sub: Task): string {
  const mark = sub.status === 'done' ? 'x' : ' ';
  const date = sub.status === 'done' ? sub.completed_at?.slice(0, 10) : null;
  return `  - [${mark}] ${sub.title}${date ? ` _(${date})_` : ''}`;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatShortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${DAY_ABBR[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

export function renderDayReportMarkdown(report: DayReport, allTasks: Task[]): string {
  const subtaskMap = buildSubtaskMap(allTasks);
  const lines: string[] = [];

  lines.push(`# End of Day — ${report.date}`);
  lines.push('');

  lines.push(`## Completed (${report.completedTasks.length})`);
  if (report.completedTasks.length === 0) {
    lines.push('_No tasks completed._');
  } else {
    for (const task of report.completedTasks) {
      const dateLabel = isLocalToday(task.completed_at)
        ? 'TODAY'
        : formatShortDate(task.completed_at?.slice(0, 10));
      lines.push(`- [x] ${task.title}${dateLabel ? ` _(${dateLabel})_` : ''}`);
      for (const sub of subtaskMap.get(task.id) ?? []) {
        lines.push(mdSubtask(sub));
      }
    }
  }

  lines.push('');
  lines.push(`## Remaining (${report.tomorrowFocus.length})`);
  if (report.tomorrowFocus.length === 0) {
    lines.push('_No remaining focused tasks._');
  } else {
    for (const task of report.tomorrowFocus) {
      lines.push(`- [ ] ${task.title}`);
      for (const sub of subtaskMap.get(task.id) ?? []) {
        lines.push(mdSubtask(sub));
      }
    }
  }

  return lines.join('\n');
}

function priorityDot(task: Task): string {
  const color = PRIORITY_COLORS[task.priority];
  return (chalk as unknown as Record<string, (s: string) => string>)[color]('●');
}

function statusLabel(task: Task): string {
  const color = STATUS_COLORS[task.status];
  return (chalk as unknown as Record<string, (s: string) => string>)[color](task.status);
}

function attribution(task: Task, sessionColors?: Record<string, SessionColor>): string {
  const label = task.created_by === 'claude' ? 'claude' : 'you';
  if (task.created_by === 'claude' && task.session_id && sessionColors) {
    const colorName = sessionColors[task.session_id];
    if (colorName) {
      const hex = SESSION_COLORS[colorName];
      return chalk.dim('[') + chalk.dim(label) + ' ' + chalk.hex(hex)('●') + chalk.dim(']');
    }
  }
  return chalk.dim(`[${label}]`);
}

export function renderTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return chalk.dim('  No tasks found.');
  }

  const lines = tasks.map(task => {
    const dot = priorityDot(task);
    const focus = task.focused ? chalk.yellow('★') : ' ';
    const status = statusLabel(task);
    const attr = attribution(task);
    const id = chalk.dim(task.id.slice(0, 8));
    return `  ${dot} ${focus} ${task.title}  ${status}  ${attr}  ${id}`;
  });

  return lines.join('\n');
}

export function renderDayReportTerminal(report: DayReport): string {
  const lines: string[] = [];
  const hr = chalk.magenta('─'.repeat(50));
  const config = loadConfig();
  const sessionColors = config.sessions;

  lines.push('');
  lines.push(chalk.magenta.bold(`  ╔${'═'.repeat(48)}╗`));
  lines.push(chalk.magenta.bold(`  ║`) + chalk.cyan.bold(`  END OF DAY — ${report.date}`) + ' '.repeat(Math.max(0, 48 - 17 - report.date.length)) + chalk.magenta.bold('║'));
  lines.push(chalk.magenta.bold(`  ╠${'═'.repeat(48)}╣`));

  // Completed
  lines.push('');
  lines.push(chalk.green.bold(`  [x] Completed today (${report.completedTasks.length})`));
  for (const task of report.completedTasks) {
    lines.push(`    ${priorityDot(task)} ${task.title}  ${attribution(task, sessionColors)}`);
  }
  if (report.completedTasks.length === 0) {
    lines.push(chalk.dim('    No tasks completed.'));
  }

  // In Progress
  lines.push('');
  lines.push(chalk.yellow.bold(`  [~] In Progress (${report.inProgressTasks.length})`));
  for (const task of report.inProgressTasks) {
    lines.push(`    ${priorityDot(task)} ${task.title}`);
  }
  if (report.inProgressTasks.length === 0) {
    lines.push(chalk.dim('    None.'));
  }

  // Started
  lines.push('');
  lines.push(chalk.cyan.bold(`  [+] Started today (${report.startedTasks.length})`));
  for (const task of report.startedTasks) {
    lines.push(`    ${priorityDot(task)} ${task.title}`);
  }
  if (report.startedTasks.length === 0) {
    lines.push(chalk.dim('    None.'));
  }

  // Stats
  lines.push('');
  lines.push(`  ${hr}`);
  lines.push(chalk.white.bold('  --- Stats'));
  const s = report.stats;
  lines.push(`    Completed:   ${chalk.green(String(s.completed))}  (${s.completedByHuman} you · ${s.completedByClaude} claude)`);
  lines.push(`    Subtasks:    ${chalk.green(String(s.subtasksCompleted))} completed today  (${s.subtasksTotal} total)`);
  lines.push(`    Started:     ${chalk.cyan(String(s.started))}`);
  lines.push(`    In progress: ${chalk.yellow(String(s.inProgress))}  (carrying over to tomorrow)`);
  lines.push(`    Completion:  ${chalk.magenta(String(s.completionRate) + '%')}`);

  // Tomorrow's Focus
  lines.push('');
  if (report.tomorrowFocus.length > 0) {
    lines.push(chalk.white.bold('  --- Tomorrow\'s Focus'));
    const showTasks = report.tomorrowFocus.slice(0, 5);
    for (const task of showTasks) {
      lines.push(`    ${priorityDot(task)} ${task.title}  ${statusLabel(task)}`);
    }
    if (report.tomorrowFocus.length > 5) {
      lines.push(chalk.dim(`    + ${report.tomorrowFocus.length - 5} more focused`));
    }
  } else {
    lines.push(chalk.white.bold('  --- Tomorrow\'s Focus'));
    lines.push(chalk.dim('    No tasks focused for tomorrow. Nice clean slate.'));
  }

  // Insight
  if (report.insight) {
    lines.push('');
    lines.push(chalk.cyan.bold('  >>> Insight'));
    lines.push(`    ${report.insight}`);
  }

  // Encouraging message
  lines.push('');
  lines.push(chalk.magenta.bold(`  -- ${report.encouragingMessage}`));

  lines.push('');
  lines.push(chalk.magenta.bold(`  ╚${'═'.repeat(48)}╝`));
  lines.push('');

  return lines.join('\n');
}
