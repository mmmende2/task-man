import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, reloadForAuth } from '../api';
import { usePoll } from '../lib/use-poll';
import { NavMenu } from '../components/NavMenu';
import { Brand } from '../components/Brand';
import { ScopeChip, loadScopeFilter, saveScopeFilter, type ScopeFilter } from '../components/ScopeChip';
import { localDateString, isOnLocalDate } from 'task-man/local-date';
import type { Task } from '../types';
import './Metrics.css';

const STATUS_ORDER: Record<string, number> = { done: 0, in_progress: 1, todo: 2 };

export function MetricsPage() {
  const today = localDateString();
  const [viewDate, setViewDate] = useState(today);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(() => loadScopeFilter());
  // "Last work day" pressed from a non-professional scope: jump once the
  // professionally-scoped response (with its own lastWorkDay) arrives.
  const [pendingLastWork, setPendingLastWork] = useState(false);
  // Which scope the currently-displayed metrics were fetched under — guards
  // the pending jump against acting on stale (pre-scope-switch) data.
  const fetchedScope = useRef<ScopeFilter>('all');

  const changeScopeFilter = (v: ScopeFilter) => {
    setScopeFilter(v);
    saveScopeFilter(v);
  };

  const fetcher = useCallback(async () => {
    try {
      const m = await api.getMetrics(viewDate, scopeFilter === 'all' ? undefined : scopeFilter);
      fetchedScope.current = scopeFilter;
      return m;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        reloadForAuth();
      }
      throw err;
    }
  }, [viewDate, scopeFilter]);

  // Slower cadence than Focus — Metrics is a reflective view.
  const { data: metrics, failures, refresh } = usePoll(fetcher, 15000);
  const showConnectionError = failures >= 3;

  // usePoll only refires on its timer; a 15s wait after changing the date or
  // scope reads as broken. Refetch immediately on either (skip the mount run —
  // usePoll's own initial tick covers it).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, scopeFilter]);

  useEffect(() => {
    if (!pendingLastWork || !metrics || fetchedScope.current !== 'professional') return;
    setPendingLastWork(false);
    if (metrics.lastWorkDay) setViewDate(metrics.lastWorkDay);
  }, [pendingLastWork, metrics]);

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

  // "Last work day" means it: jump to the last day with professional
  // completions, switching the scope to professional if it isn't already.
  // The jump target must come from the professionally-scoped response, so
  // when switching we defer the date change until that data lands (see the
  // pendingLastWork effect above).
  const goLastWorkDay = () => {
    if (scopeFilter === 'professional') {
      if (metrics?.lastWorkDay) setViewDate(metrics.lastWorkDay);
    } else {
      changeScopeFilter('professional');
      setPendingLastWork(true);
    }
  };

  const goToday = () => setViewDate(today);

  const onPickDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) setViewDate(e.target.value);
  };

  return (
    <div className="metrics-page">
      <header className="metrics-header">
        <Brand />
        <ScopeChip value={scopeFilter} onChange={changeScopeFilter} />
        <NavMenu current="metrics" />
      </header>

      {showConnectionError && (
        <div className="conn-error">Server unreachable.</div>
      )}

      <div className="metrics-daterow">
        <button
          className="metrics-jump"
          onClick={goLastWorkDay}
          disabled={scopeFilter === 'professional' ? !metrics?.lastWorkDay : !metrics}
          type="button"
        >
          ‹ Last work day
        </button>
        <div className="metrics-datepick-wrap">
          {/* Visual only — the real <input> on top receives the tap. */}
          <span className="metrics-datepick" aria-hidden="true">
            <span className="metrics-datepick-label">{isPast ? viewDate : 'Today'}</span>
            <svg className="metrics-datepick-icon" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3.5" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="11" y1="2" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          {/* The real <input type="date"> sits transparently on top and is
              the actual tap target — a direct tap is what opens the native
              picker on iOS Safari. showPicker() is a nicety for desktop
              (Chrome doesn't pop the calendar on a bare click), guarded
              because iOS <16.4 and older engines lack it. */}
          <input
            type="date"
            className="metrics-datepick-input"
            aria-label={`Change date — currently ${isPast ? viewDate : 'today'}`}
            value={viewDate}
            min={metrics?.earliestDate ?? undefined}
            max={today}
            onChange={onPickDate}
            onClick={(e) => {
              try { e.currentTarget.showPicker?.(); } catch { /* iOS opens on tap anyway */ }
            }}
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
