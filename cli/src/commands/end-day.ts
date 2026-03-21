import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';
import { buildDayReport } from '../report.js';
import { renderDayReportTerminal } from '../render-terminal.js';
import { renderDayReportHtml } from '../render-html.js';
import { sendEndOfDayEmail } from '../email.js';
import { loadConfig } from '../config.js';

function resolveDate(dateArg?: string): string {
  if (!dateArg) {
    return new Date().toISOString().slice(0, 10);
  }
  if (dateArg === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  // Assume YYYY-MM-DD
  return dateArg;
}

export const endDayCommand = new Command('end-day')
  .description('End-of-day report')
  .option('--date <date>', 'Date (YYYY-MM-DD or "yesterday")')
  .option('--email', 'Send report via email')
  .action(async (opts) => {
    const store = new TaskStore();
    const date = resolveDate(opts.date);
    const report = buildDayReport(store, date);

    console.log(renderDayReportTerminal(report));

    if (opts.email) {
      try {
        const config = loadConfig();
        const html = renderDayReportHtml(report);
        await sendEndOfDayEmail(config, html, date);
        console.log(chalk.green('✓') + ' Report emailed successfully!');
      } catch (err) {
        console.error(chalk.red('✗') + ` ${(err as Error).message}`);
      }
    }
  });
