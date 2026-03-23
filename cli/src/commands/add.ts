import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';
import type { CreatedBy, TaskPriority, TaskScope } from '../types.js';

export const addCommand = new Command('add')
  .description('Add a new task')
  .argument('<title>', 'Task title')
  .option('-p, --priority <priority>', 'Priority: low, medium, high', 'high')
  .option('-s, --scope <scope>', 'Scope: personal, professional', 'personal')
  .option('-c, --category <category...>', 'Categories (repeatable)')
  .option('--parent <id>', 'Parent task ID (creates a subtask)')
  .option('-d, --description <text>', 'Task description')
  .option('--created-by <who>', 'Created by: human, claude', 'human')
  .option('-f, --focused', 'Add as focused (default: backlog)')
  .action(async (title: string, opts) => {
    const store = new TaskStore();

    let parentId: string | undefined;
    if (opts.parent) {
      parentId = store.resolveId(opts.parent);
    }

    const task = await store.add({
      title,
      priority: opts.priority as TaskPriority,
      scope: opts.scope as TaskScope,
      categories: opts.category,
      parent_id: parentId,
      description: opts.description,
      created_by: opts.createdBy as CreatedBy,
      focused: opts.focused ?? false,
    });

    console.log(chalk.green('✓') + ` Added: ${task.title}  ${chalk.dim(task.id.slice(0, 8))}`);
  });
