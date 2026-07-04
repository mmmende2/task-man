import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { SERVER_PID_FILE } from '../constants.js';
import { startServer } from '../server/index.js';

export const serveCommand = new Command('serve')
  .description('Serve the task-man web app on your LAN')
  .option('--port <port>', 'Port to listen on (default 3030)', (v) => parseInt(v, 10))
  .option(
    '--bind <addr>',
    'Bind address (default 127.0.0.1 — this machine only). Pass 0.0.0.0 for ' +
      'LAN/container access, but note the API has no auth of its own: put it ' +
      'behind Cloudflare Access or another gate before exposing it beyond ' +
      'your own machine.',
  )
  .action(async (opts: { port?: number; bind?: string }) => {
    const { port, bind, urls, close } = startServer({ port: opts.port, bind: opts.bind });

    writeFileSync(SERVER_PID_FILE, String(process.pid), 'utf-8');
    const cleanup = () => {
      try {
        if (existsSync(SERVER_PID_FILE)) unlinkSync(SERVER_PID_FILE);
      } catch {
        /* ignore */
      }
      close();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    console.log();
    console.log(chalk.magenta.bold('  task-man web') + chalk.dim(`  (bind ${bind}:${port})`));
    console.log();
    const localOnly = bind === '127.0.0.1' || bind === 'localhost';
    console.log(
      localOnly
        ? '  Reach it from this machine (pass --bind 0.0.0.0 to allow LAN devices):'
        : '  Reach it from this or another device on the wifi:',
    );
    for (const url of urls) {
      console.log('    ' + chalk.cyan(url));
    }
    console.log();
    console.log(chalk.dim('  Ctrl-C to stop.'));
    console.log();
  });
