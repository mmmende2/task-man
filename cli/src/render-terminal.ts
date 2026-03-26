import chalk from 'chalk';
import { PRIORITY_COLORS, STATUS_COLORS } from './constants.js';
import type { DayReport, Task } from './types.js';

function priorityDot(task: Task): string {
  const color = PRIORITY_COLORS[task.priority];
  return (chalk as unknown as Record<string, (s: string) => string>)[color]('●');
}

function statusLabel(task: Task): string {
  const color = STATUS_COLORS[task.status];
  return (chalk as unknown as Record<string, (s: string) => string>)[color](task.status);
}

function attribution(task: Task): string {
  return chalk.dim(`[${task.created_by === 'claude' ? 'claude' : 'you'}]`);
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

  lines.push('');
  lines.push(chalk.magenta.bold(`  ╔${'═'.repeat(48)}╗`));
  lines.push(chalk.magenta.bold(`  ║`) + chalk.cyan.bold(`  END OF DAY — ${report.date}`) + ' '.repeat(Math.max(0, 48 - 17 - report.date.length)) + chalk.magenta.bold('║'));
  lines.push(chalk.magenta.bold(`  ╠${'═'.repeat(48)}╣`));

  // Completed
  lines.push('');
  lines.push(chalk.green.bold(`  [x] Completed today (${report.completedTasks.length})`));
  for (const task of report.completedTasks) {
    lines.push(`    ${priorityDot(task)} ${task.title}  ${attribution(task)}`);
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
  lines.push(`    Started:     ${chalk.cyan(String(s.started))}`);
  lines.push(`    In progress: ${chalk.yellow(String(s.inProgress))}  (carrying over to tomorrow)`);
  lines.push(`    Completion:  ${chalk.magenta(String(s.completionRate) + '%')}`);

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
