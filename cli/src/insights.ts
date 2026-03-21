import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { INSIGHTS_LOG_FILE } from './constants.js';
import { TaskStore } from './store.js';
import type { InsightType } from './types.js';

interface InsightsLog {
  lastType: InsightType | null;
  lastDate: string | null;
}

function loadInsightsLog(): InsightsLog {
  if (!existsSync(INSIGHTS_LOG_FILE)) {
    return { lastType: null, lastDate: null };
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

function dateStr(daysAgo: number, fromDate: string): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function generateInsight(store: TaskStore, date: string): string | null {
  const log = loadInsightsLog();
  const lastType = log.lastType;

  const completedToday = store.getCompletedOn(date);
  const todayCount = completedToday.length;

  const candidates: { type: InsightType; message: string }[] = [];

  // 1. Personal best
  if (todayCount > 0) {
    const allTasks = store.load();
    const dateCounts = new Map<string, number>();
    for (const t of allTasks) {
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
      if (store.getCompletedOn(d).length > 0) {
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
  const yesterdayCount = store.getCompletedOn(yesterday).length;
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
        message: "Today was all professional — don't forget personal tasks!",
      });
    } else if (professional === 0 && personal > 0) {
      candidates.push({
        type: 'scope_balance',
        message: "All personal tasks today — nice self-care day!",
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
    thisWeekTotal += store.getCompletedOn(dateStr(i, date)).length;
    lastWeekTotal += store.getCompletedOn(dateStr(i + 7, date)).length;
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

  // 8. Productivity tip
  const startedToday = store.getCreatedOn(date).length;
  if (startedToday >= 5 && todayCount <= 1) {
    candidates.push({
      type: 'productivity_tip',
      message: `You started ${startedToday} new tasks but only completed ${todayCount} — try finishing before starting new ones.`,
    });
  }

  // Filter out last type to avoid repeats
  const filtered = candidates.filter(c => c.type !== lastType);
  const pick = filtered.length > 0 ? filtered[0] : (candidates.length > 0 ? candidates[0] : null);

  if (pick) {
    saveInsightsLog({ lastType: pick.type, lastDate: date });
    return pick.message;
  }

  return null;
}
