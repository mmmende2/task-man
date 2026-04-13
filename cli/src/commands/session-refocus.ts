import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';
import { getCurrentSessionId } from '../sessions.js';

export const sessionRefocusCommand = new Command('session-refocus')
  .description('Refocus tasks linked to the current Claude Code session')
  .action(async () => {
    const sessionId = getCurrentSessionId();
    if (!sessionId) {
      console.log(chalk.dim('No active Claude Code session detected.'));
      return;
    }

    const store = new TaskStore();
    const tasks = store.load();
    const sessionTasks = tasks.filter(
      t => t.session_id === sessionId && !t.focused && (t.status === 'todo' || t.status === 'in_progress'),
    );

    if (sessionTasks.length === 0) {
      console.log(chalk.dim(`No unfocused tasks for session ${sessionId.slice(0, 8)}...`));
      return;
    }

    for (const task of sessionTasks) {
      await store.update(task.id, { focused: true });
    }

    console.log(
      chalk.green('✓') +
      ` Refocused ${sessionTasks.length} task${sessionTasks.length === 1 ? '' : 's'} for this session`,
    );
  });
