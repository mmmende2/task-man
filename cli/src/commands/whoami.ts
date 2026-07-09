import { Command } from 'commander';
import chalk from 'chalk';
import { whoami } from '../whoami.js';

const label = (s: string): string => chalk.dim(s.padEnd(16));

export const whoamiCommand = new Command('whoami')
  .description('Show which store the CLI/MCP talks to: mode, remote URL, reachability, identity')
  .option('--json', 'output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const info = await whoami();

    if (opts.json) {
      console.log(JSON.stringify(info, null, 2));
      if (info.mode === 'remote' && !info.reachable) process.exitCode = 1;
      return;
    }

    console.log(label('mode') + chalk.bold(info.mode));
    console.log(label('client version') + info.client_version);
    if (info.mode === 'local') {
      console.log(label('store') + info.store_path);
      return;
    }

    console.log(label('remote url') + info.remote_url);
    console.log(label('auth') + info.auth);
    console.log(
      label('reachable') +
        (info.reachable ? chalk.green('yes') : chalk.red('no')) +
        (info.server_version ? chalk.dim(` (server v${info.server_version})`) : ''),
    );
    if (info.identity !== undefined) {
      console.log(label('identity') + (info.identity ?? chalk.dim('(none)')));
    }
    if (info.error) {
      console.log(label('note') + chalk.yellow(info.error));
    }
    if (!info.reachable) process.exitCode = 1;
  });
