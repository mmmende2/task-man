import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { INSIGHTS_LOG_FILE } from './constants.js';
import { completedOn } from './task-filters.js';
import { localDateString } from './local-date.js';
import type { InsightType, Task } from './types.js';

interface InsightsLog {
  lastType: InsightType | null;
  lastDate: string | null;
  lastMessage: string | null;
}

function loadInsightsLog(): InsightsLog {
  if (!existsSync(INSIGHTS_LOG_FILE)) {
    return { lastType: null, lastDate: null, lastMessage: null };
  }
  return JSON.parse(readFileSync(INSIGHTS_LOG_FILE, 'utf-8'));
}

function saveInsightsLog(log: InsightsLog): void {
  const dir = dirname(INSIGHTS_LOG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(INSIGHTS_LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

// `new Date(fromDate)` on a date-only string parses as UTC midnight, not
// local midnight — near a DST transition, subtracting days off that instant
// and reading back via toISOString() could land on the wrong local calendar
// date. Building the Date from local year/month/day fields avoids that.
function dateStr(daysAgo: number, fromDate: string): string {
  const [y, m, day] = fromDate.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() - daysAgo);
  return localDateString(d);
}

export function generateInsight(tasks: Task[], date: string): string | null {
  const log = loadInsightsLog();
  const lastType = log.lastType;

  // Return cached insight if one was already generated today
  if (log.lastDate === date && log.lastMessage) {
    return log.lastMessage;
  }

  const completedToday = completedOn(tasks, date);
  const todayCount = completedToday.length;

  const candidates: { type: InsightType; message: string }[] = [];

  // 1. Personal best
  if (todayCount > 0) {
    const dateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.completed_at) {
        const d = t.completed_at.slice(0, 10);
        if (d !== date) {
          dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
        }
      }
    }
    const maxPrev = Math.max(0, ...dateCounts.values());
    if (todayCount > maxPrev && maxPrev > 0) {
      candidates.push({
        type: 'personal_best',
        message: `New record! ${todayCount} tasks completed — your most productive day yet!`,
      });
    }
  }

  // 2. Streak
  if (todayCount > 0) {
    let streak = 1;
    for (let i = 1; i <= 365; i++) {
      const d = dateStr(i, date);
      if (completedOn(tasks, d).length > 0) {
        streak++;
      } else {
        break;
      }
    }
    if (streak >= 3) {
      candidates.push({
        type: 'streak',
        message: `You're on a ${streak}-day streak of completing tasks!`,
      });
    }
  }

  // 3. vs Yesterday
  const yesterday = dateStr(1, date);
  const yesterdayCount = completedOn(tasks, yesterday).length;
  if (todayCount > yesterdayCount && yesterdayCount > 0) {
    const diff = todayCount - yesterdayCount;
    candidates.push({
      type: 'vs_yesterday',
      message: `You completed ${diff} more task${diff > 1 ? 's' : ''} than yesterday!`,
    });
  }

  // 4. Focus ratio
  if (todayCount > 0) {
    const focusedCompleted = completedToday.filter(t => t.focused).length;
    if (focusedCompleted === todayCount && todayCount >= 2) {
      candidates.push({
        type: 'focus_ratio',
        message: 'You completed all your focused tasks today — great prioritization!',
      });
    }
  }

  // 5. Scope balance
  if (todayCount >= 2) {
    const personal = completedToday.filter(t => t.scope === 'personal').length;
    const professional = completedToday.filter(t => t.scope === 'professional').length;
    if (personal === 0 && professional > 0) {
      candidates.push({
        type: 'scope_balance',
        message: 'Deep professional focus today.',
      });
    } else if (professional === 0 && personal > 0) {
      candidates.push({
        type: 'scope_balance',
        message: 'All personal tasks today — nice self-care day!',
      });
    } else if (personal > 0 && professional > 0) {
      candidates.push({
        type: 'scope_balance',
        message: `Nice balance! ${professional} professional and ${personal} personal tasks completed.`,
      });
    }
  }

  // 6. AI collab
  if (todayCount > 0) {
    const byClaude = completedToday.filter(t => t.created_by === 'claude').length;
    if (byClaude > 0) {
      candidates.push({
        type: 'ai_collab',
        message: `Claude handled ${byClaude} task${byClaude > 1 ? 's' : ''} for you today — teamwork!`,
      });
    }
  }

  // 7. Velocity trend (this week vs last week avg)
  const thisWeekStart = dateStr(6, date);
  const lastWeekStart = dateStr(13, date);
  let thisWeekTotal = 0;
  let lastWeekTotal = 0;
  for (let i = 0; i <= 6; i++) {
    thisWeekTotal += completedOn(tasks, dateStr(i, date)).length;
    lastWeekTotal += completedOn(tasks, dateStr(i + 7, date)).length;
  }
  if (lastWeekTotal > 0 && thisWeekTotal > lastWeekTotal) {
    const pctUp = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100);
    if (pctUp >= 10) {
      candidates.push({
        type: 'velocity_trend',
        message: `Your weekly pace is up ${pctUp}% from last week.`,
      });
    }
  }

  // 8. Productivity tip — removed (negative framing hurts more than it helps)

  // Filter out last type to avoid repeats
  const filtered = candidates.filter(c => c.type !== lastType);
  const pick = filtered.length > 0 ? filtered[0] : (candidates.length > 0 ? candidates[0] : null);

  if (pick) {
    saveInsightsLog({ lastType: pick.type, lastDate: date, lastMessage: pick.message });
    return pick.message;
  }

  return null;
}
