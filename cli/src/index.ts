#!/usr/bin/env node

import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { doneCommand } from './commands/done.js';
import { startCommand } from './commands/start.js';
import { focusCommand, unfocusCommand } from './commands/focus.js';
import { configCommand } from './commands/config.js';
import { endDayCommand } from './commands/end-day.js';
import { watchCommand } from './commands/watch.js';
import { launchInteractive } from './commands/interactive.js';

const program = new Command();

program
  .name('task-man')
  .description('Personal task manager for developers who live in the terminal')
  .version('0.1.0');

program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(doneCommand);
program.addCommand(startCommand);
program.addCommand(focusCommand);
program.addCommand(unfocusCommand);
program.addCommand(configCommand);
program.addCommand(endDayCommand);
program.addCommand(watchCommand);

program.action(() => launchInteractive());

program.parse();
