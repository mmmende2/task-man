import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config.js';
import { TASKS_FILE } from '../constants.js';
import { authFromConfig, RemoteStore } from '../remote-store.js';
import { ApiError } from '../api-client.js';
import type { Store } from '../store-interface.js';
import type {
  CreatedBy, Task, TaskPriority, TaskScope, TaskStatus, TimeEstimate, Vibe,
} from '../types.js';

const STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];
const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];
const SCOPES: readonly TaskScope[] = ['personal', 'professional'];
const ESTIMATES: readonly TimeEstimate[] = ['<5m', '20m', '45m', '>1h', '>3h'];
const VIBES: readonly Vibe[] = ['love', 'ok', 'dread'];
const CREATORS: readonly CreatedBy[] = ['human', 'claude'];

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const pickOrNull = <T>(v: unknown, allowed: readonly T[]): T | null =>
  allowed.includes(v as T) ? (v as T) : null;
const asString = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback;

/**
 * Coerce a task from any (possibly older) task-man schema into the current
 * full Task shape that /api/store/insertAt requires. Missing/invalid fields
 * get sane defaults; ids, timestamps, completion, and created_by are kept
 * as-is when present, so history and attribution survive the move.
 */
export function normalizeTask(raw: Record<string, unknown>, defaultScope: TaskScope): Task {
  const now = new Date().toISOString();
  const created_at = asString(raw.created_at, now);
  const updated_at = asString(raw.updated_at, created_at);
  const status = pick(raw.status, STATUSES, 'todo');
  let completed_at = typeof raw.completed_at === 'string' ? raw.completed_at : null;
  // A done task with no timestamp still needs a date so it lands on the
  // metrics calendar — fall back to its last-updated day.
  if (status === 'done' && !completed_at) completed_at = updated_at;
  return {
    id: asString(raw.id, randomUUID()),
    title: asString(raw.title, '(untitled)'),
    description: typeof raw.description === 'string' ? raw.description : null,
    status,
    priority: pick(raw.priority, PRIORITIES, 'medium'),
    scope: pick(raw.scope, SCOPES, defaultScope),
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is string => typeof c === 'string')
      : [],
    parent_id: typeof raw.parent_id === 'string' ? raw.parent_id : null,
    created_at,
    updated_at,
    completed_at,
    focused: raw.focused === true,
    created_by: pick(raw.created_by, CREATORS, 'human'),
    session_id: typeof raw.session_id === 'string' ? raw.session_id : null,
    time_estimate: pickOrNull(raw.time_estimate, ESTIMATES),
    vibe: pickOrNull(raw.vibe, VIBES),
  };
}

export interface MigrateReport {
  read: number;
  imported: string[];
  skipped: number;
  failed: { title: string; error: string }[];
}

/**
 * Push local tasks into a destination store via insertAt (which preserves
 * ids + timestamps), skipping any id already present so it's safe to re-run.
 * Parents are inserted before children so a child's parent_id resolves.
 */
export async function migrateTasks(
  rawTasks: Record<string, unknown>[],
  dest: Store,
  opts: { defaultScope: TaskScope; dryRun?: boolean },
): Promise<MigrateReport> {
  const normalized = rawTasks.map((t) => normalizeTask(t, opts.defaultScope));
  normalized.sort((a, b) => Number(a.parent_id !== null) - Number(b.parent_id !== null));

  // First load doubles as the auth gate — a 401/403 here throws out to the
  // caller instead of being swallowed per-task.
  const existing = await dest.load();
  const seen = new Set(existing.map((t) => t.id));
  const report: MigrateReport = { read: rawTasks.length, imported: [], skipped: 0, failed: [] };

  for (const task of normalized) {
    if (seen.has(task.id)) { report.skipped++; continue; }
    if (opts.dryRun) { report.imported.push(task.title); seen.add(task.id); continue; }
    try {
      await dest.insertAt(task, existing.length + report.imported.length);
      seen.add(task.id);
      report.imported.push(task.title);
    } catch (err) {
      report.failed.push({ title: task.title, error: (err as Error).message });
    }
  }
  return report;
}

function readLocalTasks(path: string): Record<string, unknown>[] {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  const wrapped = (raw as { tasks?: unknown }).tasks;
  return Array.isArray(wrapped) ? (wrapped as Record<string, unknown>[]) : [];
}

export const migrateCommand = new Command('migrate')
  .description("Import this machine's local task store into the configured remote server (one-way, additive, safe to re-run)")
  .option('--from <path>', 'local tasks.json to read', TASKS_FILE)
  .option('--default-scope <scope>', 'scope for tasks that have none (personal|professional)', 'personal')
  .option('--dry-run', 'preview what would be imported without writing')
  .action(async (opts: { from: string; defaultScope: string; dryRun?: boolean }) => {
    const config = loadConfig();
    const remoteUrl = config.client?.remote_url;
    if (!remoteUrl) {
      console.log(
        chalk.yellow('No remote server configured.') + ' Run ' +
        chalk.cyan('task-man config client.remote_url <url>') + ' then ' +
        chalk.cyan('task-man login') + ' first.',
      );
      process.exitCode = 1;
      return;
    }
    const defaultScope: TaskScope = opts.defaultScope === 'professional' ? 'professional' : 'personal';

    if (!existsSync(opts.from)) {
      console.log(chalk.red('✗') + ` No local store found at ${opts.from}`);
      process.exitCode = 1;
      return;
    }
    let rawTasks: Record<string, unknown>[];
    try {
      rawTasks = readLocalTasks(opts.from);
    } catch (err) {
      console.log(chalk.red('✗') + ` Could not read ${opts.from}: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
    if (rawTasks.length === 0) {
      console.log(chalk.yellow('Nothing to import — the local store is empty.'));
      return;
    }

    console.log(chalk.dim(`Reading ${rawTasks.length} tasks from ${opts.from}`));
    console.log(chalk.dim(`→ ${opts.dryRun ? 'dry run against' : 'importing into'} ${remoteUrl}\n`));

    const remote = new RemoteStore(remoteUrl, { authHeaders: authFromConfig(config.client!) });

    let report: MigrateReport;
    try {
      report = await migrateTasks(rawTasks, remote, { defaultScope, dryRun: opts.dryRun });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        console.log(chalk.red('✗') + ' Not authenticated to the remote. Run ' + chalk.cyan('task-man login') + ' first.');
      } else if (err instanceof ApiError) {
        console.log(chalk.red('✗') + ` Remote error (${err.status}): ${err.message}`);
      } else {
        console.log(chalk.red('✗') + ` ${(err as Error).message}`);
      }
      process.exitCode = 1;
      return;
    }

    const verb = opts.dryRun ? 'Would import' : 'Imported';
    const extras = [`skipped ${report.skipped} already present`];
    if (report.failed.length) extras.push(`${report.failed.length} failed`);
    console.log(chalk.green('✓') + ` ${verb} ${report.imported.length} ` + chalk.dim(`· ${extras.join(' · ')}`));

    if (opts.dryRun) {
      for (const t of report.imported.slice(0, 50)) console.log(chalk.dim('  + ') + t);
      if (report.imported.length > 50) console.log(chalk.dim(`  … and ${report.imported.length - 50} more`));
    }
    for (const f of report.failed) console.log(chalk.red('  ✗ ') + `${f.title} — ${f.error}`);

    if (opts.dryRun) {
      console.log(chalk.dim('\nRe-run without --dry-run to apply. Safe to re-run — existing tasks are skipped by id.'));
    } else if (report.imported.length) {
      console.log(chalk.dim('\nDone. Switch this machine to remote mode and retire the local file so you never edit two diverging stores.'));
    }
  });
