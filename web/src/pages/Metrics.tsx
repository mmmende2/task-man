import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePoll } from '../lib/use-poll';
import { NavMenu } from '../components/NavMenu';
import { Brand } from '../components/Brand';
import { localDateString, isOnLocalDate } from 'task-man/local-date';
import type { Task } from '../types';
import './Metrics.css';

const STATUS_ORDER: Record<string, number> = { done: 0, in_progress: 1, todo: 2 };

export function MetricsPage() {
  const nav = useNavigate();
  const today = localDateString();
  const [viewDate, setViewDate] = useState(today);

  const fetcher = useCallback(async () => {
    try {
      return await api.getMetrics(viewDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        nav('/login', { replace: true });
      }
      throw err;
    }
  }, [nav, viewDate]);

  // Slower cadence than Focus — Metrics is a reflective view.
  const { data: metrics, failures } = usePoll(fetcher, 15000);
  const showConnectionError = failures >= 3;

  const isPast = viewDate !== today;
  const dateLabel = isPast ? `Done on ${viewDate}` : 'Done today';
  const sectionLabel = isPast ? `Progress — ${viewDate}` : "Today's Progress";

  const completed = metrics?.stats.completed ?? 0;
  const inProgress = metrics?.stats.inProgress ?? 0;
  const progressTotal = completed + inProgress;
  const progressPercent = progressTotal > 0 ? Math.round((completed / progressTotal) * 100) : 0;

  const sortedActive = useMemo(() => {
    if (!metrics) return [];
    const set = new Map<string, Task>();
    for (const t of metrics.completedTasks) set.set(t.id, t);
    for (const t of metrics.inProgressTasks) set.set(t.id, t);
    return [...set.values()].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2),
    );
  }, [metrics]);

  const goLastWorkDay = () => {
    if (metrics?.lastWorkDay) setViewDate(metrics.lastWorkDay);
  };

  const goToday = () => setViewDate(today);

  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const onPickDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) setViewDate(e.target.value);
  };

  // Desktop browsers don't reliably open the native picker when the click
  // lands on an overlaying label — the input has to be interacted with
  // directly. showPicker() sidesteps that on Chrome/Safari/Firefox; we
  // fall back to focus+click for older engines.
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fallthrough */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="metrics-page">
      <header className="metrics-header">
        <Brand />
        <NavMenu current="metrics" />
      </header>

      {showConnectionError && (
        <div className="conn-error">Server unreachable.</div>
      )}

      <div className="metrics-daterow">
        <button
          className="metrics-jump"
          onClick={goLastWorkDay}
          disabled={!metrics?.lastWorkDay}
          type="button"
        >
          ‹ Last work day
        </button>
        <div className="metrics-datepick-wrap">
          <button
            type="button"
            className="metrics-datepick"
            onClick={openDatePicker}
          >
            <span className="metrics-datepick-label">{isPast ? viewDate : 'Today'}</span>
            <svg className="metrics-datepick-icon" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3.5" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="11" y1="2" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          {/* The real <input type="date"> is a sibling — never a child of
              the button. Nesting form controls inside <button> is invalid
              HTML and silently breaks the input in some browsers, which
              is why showPicker() was doing nothing on desktop. */}
          <input
            ref={dateInputRef}
            type="date"
            className="metrics-datepick-input"
            value={viewDate}
            min={metrics?.earliestDate ?? undefined}
            max={today}
            onChange={onPickDate}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        {isPast ? (
          <button className="metrics-jump" onClick={goToday} type="button">
            Today ›
          </button>
        ) : (
          <span className="metrics-jump-spacer" />
        )}
      </div>

      <div className="metrics-summary">
        <div className="metrics-summary-top">
          <span className="metrics-done-label">
            {dateLabel}: <strong>{completed}</strong>
          </span>
          <div className="metrics-bar" aria-label={`${progressPercent}% complete`}>
            <div className="metrics-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        {metrics ? (
          <div className="metrics-attrib">
            You: {metrics.stats.completedByHuman} · Claude: {metrics.stats.completedByClaude}
            {metrics.stats.subtasksCompleted > 0
              ? ` · Subtasks: ${metrics.stats.subtasksCompleted}`
              : ''}
          </div>
        ) : null}
      </div>

      <div className="metrics-divider">
        <span>{sectionLabel}</span>
      </div>

      <div className="metrics-list">
        {sortedActive.length === 0 ? (
          <div className="metrics-empty">No focused tasks.</div>
        ) : (
          sortedActive.map((task) => (
            <ParentRow
              key={task.id}
              task={task}
              subs={metrics?.subtasksByParent[task.id] ?? []}
              viewDate={viewDate}
            />
          ))
        )}
      </div>

      {metrics?.insight ? (
        <div className="metrics-insight">
          <span className="metrics-insight-prefix">›››</span> {metrics.insight}
        </div>
      ) : null}
    </div>
  );
}

interface ParentRowProps {
  task: Task;
  subs: Task[];
  viewDate: string;
}

function ParentRow({ task, subs, viewDate }: ParentRowProps) {
  const doneSubs = subs.filter((s) => s.status === 'done');
  const doneTodaySubs = doneSubs.filter((s) => isOnLocalDate(s.completed_at, viewDate));
  const donePriorSubs = doneSubs.length - doneTodaySubs.length;
  const total = subs.length;
  const isFullyDone =
    task.status === 'done' &&
    isOnLocalDate(task.completed_at, viewDate) &&
    (total === 0 || doneSubs.length === total);

  return (
    <div className={`metrics-row ${isFullyDone ? 'fully-done' : ''} status-${task.status}`}>
      <div className="metrics-row-head">
        <span className="metrics-dot" aria-hidden="true">
          {task.status === 'todo' ? '○' : '◉'}
        </span>
        <span className="metrics-title">{task.title}</span>
        {total > 0 ? (
          <div className="metrics-subbar" aria-label={`${doneSubs.length}/${total} subtasks done`}>
            <span className="seg-today" style={{ flex: doneTodaySubs.length }} />
            <span className="seg-prior" style={{ flex: donePriorSubs }} />
            <span className="seg-rest" style={{ flex: total - doneSubs.length }} />
          </div>
        ) : null}
      </div>
      {subs.length > 0 ? (
        <ul className="metrics-subtree">
          {subs.map((s, i) => {
            const isLast = i === subs.length - 1;
            const isDone = s.status === 'done';
            const isDoneToday = isDone && isOnLocalDate(s.completed_at, viewDate);
            return (
              <li
                key={s.id}
                className={`metrics-sub ${isDone ? 'done' : ''} ${isDoneToday ? 'today' : ''}`}
              >
                <span className="metrics-sub-connector mono">{isLast ? '└─' : '├─'}</span>
                <span className="metrics-sub-mark" aria-hidden="true">
                  {isDone ? '◉' : '○'}
                </span>
                <span className="metrics-sub-title">{s.title}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
