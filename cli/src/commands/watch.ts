import { Command } from 'commander';
import { render } from 'ink';
import { createElement } from 'react';
import { WatchApp } from '../ui/WatchApp.js';

export const watchCommand = new Command('watch')
  .description('Watch focused tasks (live-updating)')
  .option('-i, --interval <ms>', 'Poll interval in milliseconds', '2000')
  .action((opts) => {
    const interval = parseInt(opts.interval, 10);
    const { waitUntilExit } = render(createElement(WatchApp, { interval }));
    waitUntilExit().catch(() => {});
  });
