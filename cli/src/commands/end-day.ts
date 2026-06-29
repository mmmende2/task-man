import { Command } from 'commander';
import chalk from 'chalk';
import { TaskStore } from '../store.js';
import { buildDayReport } from '../report.js';
import { renderDayReportMarkdown } from '../render-terminal.js';
import { renderDayReportHtml } from '../render-html.js';
import { sendEndOfDayEmail } from '../email.js';
import { loadConfig } from '../config.js';
import { parseReportDate } from '../local-date.js';

export const endDayCommand = new Command('end-day')
  .description('End-of-day report')
  .option('--date <date>', 'Date (YYYY-MM-DD or "yesterday")')
  .option('--email', 'Send report via email')
  .action(async (opts) => {
    const store = new TaskStore();
    const date = parseReportDate(opts.date);
    const report = buildDayReport(store, date);

    console.log(renderDayReportMarkdown(report, store.load()));
    console.log('');

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
