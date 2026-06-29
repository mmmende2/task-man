import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { loadConfig, saveConfig } from '../config.js';
import { SERVER_PID_FILE } from '../constants.js';
import { startServer } from '../server/index.js';

/**
 * Set the web PIN via a dedicated path that keeps it a STRING.
 * `task-man config server.pin 1234` would coerce to the number 1234
 * (and mangle leading zeros like 0042 -> 42); this avoids that.
 */
async function setPin(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const pin = (await rl.question('Set a 4-digit web PIN: ')).trim();
    if (!/^\d{4}$/.test(pin)) {
      console.log(chalk.red('✗') + ' PIN must be exactly 4 digits.');
      process.exitCode = 1;
      return;
    }
    const config = loadConfig();
    config.server = { ...config.server, pin };
    saveConfig(config);
    console.log(chalk.green('✓') + ' Web PIN set. Start the server with ' + chalk.cyan('task-man serve') + '.');
  } finally {
    rl.close();
  }
}

export const serveCommand = new Command('serve')
  .description('Serve the task-man web app on your LAN')
  .option('--port <port>', 'Port to listen on (default 3030)', (v) => parseInt(v, 10))
  .option('--bind <addr>', 'Bind address (default 0.0.0.0; 127.0.0.1 = local only)')
  .option('--set-pin', 'Set the 4-digit web access PIN, then exit')
  .action(async (opts: { port?: number; bind?: string; setPin?: boolean }) => {
    if (opts.setPin) {
      await setPin();
      return;
    }

    const config = loadConfig();
    if (!config.server?.pin) {
      console.log(chalk.yellow('No web PIN set.') + ' Run ' + chalk.cyan('task-man serve --set-pin') + ' first.');
      process.exitCode = 1;
      return;
    }

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
    console.log('  Reach it from this or another device on the wifi:');
    for (const url of urls) {
      console.log('    ' + chalk.cyan(url));
    }
    console.log();
    console.log(chalk.dim('  Enter your PIN on first visit. Ctrl-C to stop.'));
    console.log();
  });
