import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config.js';

export const loginCommand = new Command('login')
  .description('Authenticate the TUI/CLI to a remote task-man server via Cloudflare Access')
  .action(async () => {
    const config = loadConfig();
    const remoteUrl = config.client?.remote_url;
    if (!remoteUrl) {
      console.log(
        chalk.yellow('No remote server configured.') +
          ' Run ' + chalk.cyan('task-man config client.remote_url <url>') + ' first.',
      );
      process.exitCode = 1;
      return;
    }

    await new Promise<void>((resolve) => {
      const child = spawn('cloudflared', ['access', 'login', remoteUrl], { stdio: 'inherit' });
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          console.log(chalk.red('✗') + ' cloudflared not found. Install it: ' + chalk.cyan('brew install cloudflared'));
        } else {
          console.log(chalk.red('✗') + ` ${err.message}`);
        }
        process.exitCode = 1;
        resolve();
      });
      child.on('exit', (code) => {
        if (code !== 0) process.exitCode = code ?? 1;
        resolve();
      });
    });
  });
