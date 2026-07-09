/**
 * Local-time YYYY-MM-DD string for date comparisons that should
 * roll over at the *user's* midnight, not UTC's. Use this — not
 * `toISOString().slice(0, 10)` — anywhere "today" is a display
 * concept (e.g. retention windows on Focus/Plan).
 *
 * `Date.prototype.toISOString()` always returns UTC, which means in
 * any non-UTC timezone a task completed at, say, 3 PM Pacific gets
 * stamped with the current UTC date — and the moment UTC midnight
 * rolls over (4–5 PM local in PT, ~8 PM in ET) the same task no
 * longer matches "today's date" computed from UTC. From the user's
 * perspective, today's wins vanish from the screen mid-afternoon.
 *
 * Always call this fresh — don't memoize the result across the
 * lifetime of a long-running TUI, or it gets stuck on yesterday.
 */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if `iso` (an ISO-8601 timestamp string) falls on the local "today". */
export function isLocalToday(iso: string | null | undefined): boolean {
  return isOnLocalDate(iso, localDateString());
}

/**
 * True if `iso` (an ISO-8601 timestamp string) falls on the given local
 * `date` (YYYY-MM-DD, also in local time). Pair with the store query
 * methods so "completed on date X" means X-in-the-user's-timezone, not
 * X-in-UTC. Without this, a task completed at 6 PM PT on Sat 6/27 has
 * a `completed_at` starting with "2026-06-28" (UTC) and would be hidden
 * from the Sat 6/27 end-of-day report.
 */
export function isOnLocalDate(iso: string | null | undefined, date: string): boolean {
  if (!iso) return false;
  return localDateString(new Date(iso)) === date;
}

/**
 * Add `delta` days to a local `YYYY-MM-DD` string, returning another
 * `YYYY-MM-DD`. Parses by components (`new Date(y, m-1, d+delta)`) so the
 * arithmetic happens in local time and rolls month/year/DST boundaries
 * correctly. NEVER `new Date(dateString)` here — that parses as UTC midnight
 * and shifts the date west of UTC (the whole reason this module exists).
 */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDateString(new Date(y, m - 1, d + delta));
}

/**
 * The day Metrics should open on, by scope and time of day:
 *   - morning (before 12:00 local) + personal/all → yesterday
 *   - morning + professional → last work day (fallback: yesterday)
 *   - afternoon/evening → today
 * Scope 'all' is treated as personal. The result is clamped to ≤ today.
 * `now` is injectable for testing; defaults to the current time.
 */
export function defaultMetricsDate({
  scope,
  lastWorkDay,
  now,
}: {
  scope: 'all' | 'personal' | 'professional';
  lastWorkDay: string | null;
  now?: Date;
}): string {
  const n = now ?? new Date();
  const today = localDateString(n);
  let result = today;
  if (n.getHours() < 12) {
    result =
      scope === 'professional'
        ? lastWorkDay ?? addDays(today, -1)
        : addDays(today, -1);
  }
  // Clamp to today (lastWorkDay is always in the past, but guard anyway).
  return result > today ? today : result;
}

/**
 * Resolve a date argument from the CLI/MCP end-day commands:
 *   undefined | null | 'today' → local-today
 *   'yesterday'                → local-yesterday
 *   any other string           → returned as-is (assumed YYYY-MM-DD local)
 */
export function parseReportDate(arg?: string | null): string {
  if (!arg || arg === 'today') return localDateString();
  if (arg === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateString(d);
  }
  return arg;
}
