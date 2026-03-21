import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';

export const doneCommand = new Command('done')
  .description('Mark a task as done')
  .argument('<id>', 'Task ID or prefix')
  .action(async (id: string) => {
    const store = new TaskStore();
    const task = await store.update(id, { status: 'done' });
    console.log(chalk.green('✓') + ` Done: ${task.title}  ${chalk.dim(task.id.slice(0, 8))}`);
  });
