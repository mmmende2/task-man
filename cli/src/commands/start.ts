import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';

export const startCommand = new Command('start')
  .description('Mark a task as in progress')
  .argument('<id>', 'Task ID or prefix')
  .action(async (id: string) => {
    const store = new TaskStore();
    const task = await store.update(id, { status: 'in_progress' });
    console.log(chalk.yellow('→') + ` Started: ${task.title}  ${chalk.dim(task.id.slice(0, 8))}`);
  });
