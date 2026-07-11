import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './constants.js';

// Opt-in TUI diagnostics (`task-man --debug`), appended to a file so they
// never fight ink for the terminal. Used to chase timing bugs that only
// reproduce live (e.g. refine-mode question cycling) — the log captures the
// interleaving of effects, timers, and input that a test can't.

export const DEBUG_LOG_FILE = join(DATA_DIR, 'debug.log');

let enabled = false;

export function initDebugLog(): void {
  enabled = true;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(
    DEBUG_LOG_FILE,
    `\n=== task-man TUI debug session ${new Date().toISOString()} pid=${process.pid} ===\n`,
  );
}

export function isDebugLogEnabled(): boolean {
  return enabled;
}

/**
 * Append one timestamped line; no-op unless --debug was passed. Synchronous
 * append keeps lines whole across the effect/timer/input interleaving we're
 * here to observe. Logging must never take the TUI down, so failures are
 * swallowed.
 */
export function debugLog(tag: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
    appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString().slice(11, 23)} ${tag}${suffix}\n`);
  } catch {
    // never break the TUI over logging
  }
}
