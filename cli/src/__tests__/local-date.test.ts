import { describe, it, expect, vi, afterEach } from 'vitest';
import { localDateString, isLocalToday, addDays, defaultMetricsDate } from '../local-date.js';

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

  describe('addDays', () => {
    it('steps within a month', () => {
      expect(addDays('2026-07-09', -1)).toBe('2026-07-08');
      expect(addDays('2026-07-09', 1)).toBe('2026-07-10');
    });

    it('rolls a month boundary backward', () => {
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('rolls a year boundary backward', () => {
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('handles a US spring-forward DST day without drifting', () => {
      // 2026-03-08 is the US DST switch; component-based math must not shift
      // the calendar date regardless of the host timezone.
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
      expect(addDays('2026-03-09', -1)).toBe('2026-03-08');
    });

    it('handles a US fall-back DST day without drifting', () => {
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
      expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
    });
  });

  describe('defaultMetricsDate', () => {
    const morning = new Date(2026, 6, 9, 9, 0, 0); // 2026-07-09 09:00 local
    const afternoon = new Date(2026, 6, 9, 15, 0, 0); // 2026-07-09 15:00 local
    const LWD = '2026-07-06';
    const YESTERDAY = '2026-07-08';
    const TODAY = '2026-07-09';

    it('morning + personal → yesterday (lastWorkDay ignored)', () => {
      expect(defaultMetricsDate({ scope: 'personal', lastWorkDay: LWD, now: morning })).toBe(YESTERDAY);
      expect(defaultMetricsDate({ scope: 'personal', lastWorkDay: null, now: morning })).toBe(YESTERDAY);
    });

    it('morning + all → yesterday (treated as personal)', () => {
      expect(defaultMetricsDate({ scope: 'all', lastWorkDay: LWD, now: morning })).toBe(YESTERDAY);
      expect(defaultMetricsDate({ scope: 'all', lastWorkDay: null, now: morning })).toBe(YESTERDAY);
    });

    it('morning + professional → last work day, falling back to yesterday', () => {
      expect(defaultMetricsDate({ scope: 'professional', lastWorkDay: LWD, now: morning })).toBe(LWD);
      expect(defaultMetricsDate({ scope: 'professional', lastWorkDay: null, now: morning })).toBe(YESTERDAY);
    });

    it('afternoon → today for every scope', () => {
      for (const scope of ['personal', 'professional', 'all'] as const) {
        expect(defaultMetricsDate({ scope, lastWorkDay: LWD, now: afternoon })).toBe(TODAY);
        expect(defaultMetricsDate({ scope, lastWorkDay: null, now: afternoon })).toBe(TODAY);
      }
    });
  });
});
