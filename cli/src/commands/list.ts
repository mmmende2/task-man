import { Command } from 'commander';
import { TaskStore } from '../store.js';
import { renderTaskList } from '../render-terminal.js';
import type { TaskScope, TaskStatus } from '../types.js';

export const listCommand = new Command('list')
  .description('List tasks')
  .option('-s, --scope <scope>', 'Filter by scope: personal, professional')
  .option('--status <status>', 'Filter by status: todo, in_progress, done')
  .option('--focused', 'Show only focused tasks')
  .option('--backlog', 'Show only backlog tasks')
  .option('-c, --category <category>', 'Filter by category')
  .action((opts) => {
    const store = new TaskStore();

    let focused: boolean | undefined;
    if (opts.focused) focused = true;
    if (opts.backlog) focused = false;

    const tasks = store.query({
      scope: opts.scope as TaskScope | undefined,
      status: opts.status as TaskStatus | undefined,
      focused,
      category: opts.category,
    });

    console.log(renderTaskList(tasks));
  });
