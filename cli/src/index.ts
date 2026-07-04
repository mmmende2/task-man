#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config.js';
import { watchCommand } from './commands/watch.js';
import { serveCommand } from './commands/serve.js';
import { loginCommand } from './commands/login.js';
import { launchInteractive } from './commands/interactive.js';

const program = new Command();

program
  .name('task-man')
  .description('Personal task manager for developers who live in the terminal')
  .version('0.1.0');

// The task-facing CLI (add/list/done/start/focus/unfocus/session-refocus/
// end-day) was retired 2026-07: humans work in the TUI/web, Claude works
// through MCP (task_end_day covers reports + email), and those commands only
// ever touched the local file (never remote mode). See PRD Phase 5.
// What remains is operational.
program.addCommand(configCommand);
program.addCommand(watchCommand);
program.addCommand(serveCommand);
program.addCommand(loginCommand);

program.action(() => launchInteractive());

program.parse();
