import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';

export const focusCommand = new Command('focus')
  .description('Pull a task into focus')
  .argument('<id>', 'Task ID or prefix')
  .action(async (id: string) => {
    const store = new TaskStore();
    const task = await store.update(id, { focused: true });
    console.log(chalk.yellow('★') + ` Focused: ${task.title}  ${chalk.dim(task.id.slice(0, 8))}`);
  });

export const unfocusCommand = new Command('unfocus')
  .description('Send a task to backlog')
  .argument('<id>', 'Task ID or prefix')
  .action(async (id: string) => {
    const store = new TaskStore();
    const task = await store.update(id, { focused: false });
    console.log(chalk.dim('○') + ` Unfocused: ${task.title}  ${chalk.dim(task.id.slice(0, 8))}`);
  });
