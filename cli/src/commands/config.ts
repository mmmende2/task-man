import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigValue, setConfigValue } from '../config.js';

export const configCommand = new Command('config')
  .description('Get or set configuration values')
  .argument('<key>', 'Config key (dot notation, e.g. email.to)')
  .argument('[value]', 'Value to set (omit to read)')
  .action((key: string, value?: string) => {
    if (value === undefined) {
      const current = getConfigValue(key);
      if (current === undefined) {
        console.log(chalk.dim(`${key} is not set`));
      } else {
        console.log(`${key} = ${chalk.cyan(JSON.stringify(current))}`);
      }
    } else {
      setConfigValue(key, value);
      console.log(chalk.green('✓') + ` Set ${key} = ${chalk.cyan(value)}`);
    }
  });
