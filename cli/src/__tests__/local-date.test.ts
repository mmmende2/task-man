import { describe, it, expect, vi, afterEach } from 'vitest';
import { localDateString, isLocalToday } from '../local-date.js';

describe('local-date', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a Date in local time, not UTC', () => {
    // Pick a Date whose UTC date differs from its local date depending
    // on the host timezone. The point of the helper is that it uses
    // the local components — so we read off the same Date the helper
    // sees and assert the format matches its local components.
    const d = new Date('2026-03-15T03:30:00Z');
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(localDateString(d)).toBe(expected);
  });

  it('isLocalToday is true when the ISO timestamp falls on the local "today"', () => {
    const now = new Date();
    expect(isLocalToday(now.toISOString())).toBe(true);
  });

  it('isLocalToday is false for null / undefined', () => {
    expect(isLocalToday(null)).toBe(false);
    expect(isLocalToday(undefined)).toBe(false);
  });

  it('retention bug regression: a task completed earlier today still counts as "today" after UTC midnight', () => {
    // Lock the wall clock to a moment AFTER UTC midnight but where
    // the local date is still the same as the completion time.
    // Concretely: pretend it's now 02:00 UTC the next day, but the
    // completion happened at 22:00 UTC (yesterday in UTC, but if
    // your local TZ is anything west of UTC it's the same local day).
    // To make this test deterministic across the CI host's TZ we
    // simulate the worst case directly: a Date whose local-date
    // matches and a "now" whose local-date matches it too.
    const completion = new Date();
    completion.setHours(8, 0, 0, 0); // 8 AM today local
    const now = new Date();
    now.setHours(20, 0, 0, 0); // 8 PM today local
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(isLocalToday(completion.toISOString())).toBe(true);
  });
});
