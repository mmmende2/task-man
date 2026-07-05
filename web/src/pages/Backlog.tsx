import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, reloadForAuth } from '../api';
import type { Task } from '../types';
import { usePoll } from '../lib/use-poll';
import { NavMenu } from '../components/NavMenu';
import { sortTasks } from 'task-man/handlers';
import { isLocalToday } from 'task-man/local-date';
import { CategoryFilterButton } from '../components/CategoryFilterDrawer';
import { ScopeChip, loadScopeFilter, saveScopeFilter, matchesScope, type ScopeFilter } from '../components/ScopeChip';
import './Backlog.css';

const FILTER_STORAGE_KEY = 'backlog.categoryFilter';

function loadFilter(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveFilter(s: Set<string>) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...s]));
  } catch {
    /* sessionStorage full or disabled — filter just won't persist */
  }
}

export function BacklogPage() {
  const nav = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(() => loadFilter());
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(() => loadScopeFilter());

  const updateCategoryFilter = (next: Set<string>) => {
    setCategoryFilter(next);
    saveFilter(next);
  };

  const changeScopeFilter = (v: ScopeFilter) => {
    setScopeFilter(v);
    saveScopeFilter(v);
  };

  const fetcher = useCallback(async () => {
    try {
      return await api.listTasks();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        reloadForAuth();
      }
      throw err;
    }
  }, [nav]);

  const { data: tasks, loading, failures, refresh } = usePoll(fetcher, 2000);

  // Backlog view shows EVERY non-done parent — focused + unfocused —
  // so you can manage the working set from one place. Done parents
  // are dropped (use the Focus view to see today's wins).
  const { focusedParents, backlogParents, subtasksByParent } = useMemo(() => {
    const subs = new Map<string, Task[]>();
    const focusedList: Task[] = [];
    const backlogList: Task[] = [];
    const hasFilter = categoryFilter.size > 0;
    for (const t of tasks ?? []) {
      if (t.parent_id) {
        const arr = subs.get(t.parent_id) ?? [];
        arr.push(t);
        subs.set(t.parent_id, arr);
        continue;
      }
      // Mirror the Focus retention rule for consistency — done parents
      // completed today still show in their respective bucket; done +
      // older falls off entirely.
      if (t.status === 'done' && !isLocalToday(t.completed_at)) continue;
      if (!matchesScope(t.scope, scopeFilter)) continue;
      // Category filter: a parent matches when its categories intersect
      // the active set. Empty set = no filter.
      if (hasFilter && !t.categories.some((c) => categoryFilter.has(c))) continue;
      if (t.focused) focusedList.push(t);
      else backlogList.push(t);
    }
    return {
      focusedParents: sortTasks(focusedList, 'focus'),
      backlogParents: sortTasks(backlogList, 'focus'),
      subtasksByParent: subs,
    };
  }, [tasks, categoryFilter, scopeFilter]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const withAction = async (id: string, op: () => Promise<unknown>) => {
    setActing((s) => new Set(s).add(id));
    try {
      await op();
      refresh();
    } catch (err) {
      flashToast((err as Error).message || 'Failed');
    } finally {
      setActing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const showConnectionError = failures >= 3;
  const total = focusedParents.length + backlogParents.length;

  const renderRow = (t: Task) => (
    <BacklogRow
      key={t.id}
      task={t}
      showScope={scopeFilter === 'all'}
      subtasks={subtasksByParent.get(t.id) ?? []}
      expanded={expandedId === t.id}
      busy={acting.has(t.id)}
      onToggleExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
      onToggleFocus={() =>
        withAction(t.id, async () => {
          if (t.focused) {
            await api.unfocus(t.id);
            flashToast('Sent to backlog');
          } else {
            await api.patchTask(t.id, { focused: true });
            flashToast('Focused ★');
          }
        })
      }
      onComplete={() =>
        withAction(t.id, async () => {
          await api.complete(t.id);
          flashToast('Done ✓');
        })
      }
      onReopen={() =>
        withAction(t.id, async () => {
          await api.patchTask(t.id, { status: 'todo' });
          flashToast('Reopened');
        })
      }
      onSubtaskToggle={(sub) =>
        withAction(sub.id, async () => {
          await api.patchTask(sub.id, { status: sub.status === 'done' ? 'todo' : 'done' });
        })
      }
      onAddSubtask={async (title) => {
        try {
          await api.createTask({ title, parent_id: t.id, focused: false });
          flashToast('Subtask added');
          refresh();
          return true;
        } catch (err) {
          flashToast((err as Error).message || 'Failed to add subtask');
          return false;
        }
      }}
    />
  );

  return (
    <div className="backlog-page">
      <header className="backlog-header">
        <button className="back-btn" onClick={() => nav('/')} aria-label="back">
          ←
        </button>
        <div className="backlog-title">Backlog</div>
        <ScopeChip value={scopeFilter} onChange={changeScopeFilter} />
        <CategoryFilterButton active={categoryFilter} onChange={updateCategoryFilter} />
        <NavMenu current="backlog" />
      </header>

      {showConnectionError && (
        <div className="conn-error">
          Server unreachable.
          <button onClick={() => refresh()} className="conn-retry">Retry</button>
        </div>
      )}

      <main className="backlog-list">
        {loading && !tasks && <div className="empty">Loading…</div>}
        {tasks && total === 0 && (
          <div className="empty">
            Nothing here yet. <br />
            <span className="dim">
              <button className="inline-link" onClick={() => nav('/capture')}>Capture</button> your first task.
            </span>
          </div>
        )}
        {focusedParents.length > 0 && (
          <>
            <div className="group-label">
              <span className="group-dot focused" />
              Focused
              <span className="group-count">{focusedParents.length}</span>
            </div>
            {focusedParents.map(renderRow)}
          </>
        )}
        {backlogParents.length > 0 && (
          <>
            <div className="group-label">
              <span className="group-dot" />
              Backlog
              <span className="group-count">{backlogParents.length}</span>
            </div>
            {backlogParents.map(renderRow)}
          </>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

interface RowProps {
  task: Task;
  subtasks: Task[];
  expanded: boolean;
  busy: boolean;
  /** Render a dim personal/professional tag — set when the scope filter is 'all'. */
  showScope?: boolean;
  onToggleExpand: () => void;
  onToggleFocus: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onSubtaskToggle: (sub: Task) => void;
  onAddSubtask: (title: string) => Promise<boolean>;
}

function BacklogRow({
  task, subtasks, expanded, busy, showScope,
  onToggleExpand, onToggleFocus, onComplete, onReopen, onSubtaskToggle, onAddSubtask,
}: RowProps) {
  const isDone = task.status === 'done';
  const subDone = subtasks.filter((s) => s.status === 'done').length;
  const subTotal = subtasks.length;

  const [addingSub, setAddingSub] = useState(false);
  const [subDraft, setSubDraft] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const subRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSub) subRef.current?.focus();
  }, [addingSub]);

  useEffect(() => {
    if (!expanded) {
      setAddingSub(false);
      setSubDraft('');
    }
  }, [expanded]);

  const commitSubtask = async () => {
    const title = subDraft.trim();
    if (!title || addBusy) return;
    setAddBusy(true);
    const ok = await onAddSubtask(title);
    setAddBusy(false);
    if (ok) {
      setSubDraft('');
      subRef.current?.focus();
    }
  };

  return (
    <div
      className={`backlog-row${task.focused ? ' is-focused' : ''}${expanded ? ' expanded' : ''}${busy ? ' busy' : ''}${isDone ? ' done' : ''}`}
    >
      <div className="row-main">
        <button className="row-tap" onClick={onToggleExpand}>
          <PriorityDot priority={task.priority} status={task.status} />
          <div className="row-title-block">
            <div className="row-title mono">{task.title}</div>
            <div className="row-meta">
              {showScope && <span className="chip scope-tag">{task.scope}</span>}
              {task.categories.slice(0, 2).map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
              {subTotal > 0 && (
                <span className="sub-progress mono">
                  {subDone}/{subTotal}
                </span>
              )}
              {isDone && <span className="done-stamp">done today</span>}
              {task.status === 'in_progress' && <span className="prog-stamp">in progress</span>}
            </div>
          </div>
        </button>
        <Toggle
          on={task.focused}
          busy={busy}
          onChange={onToggleFocus}
          ariaLabel={task.focused ? 'unfocus' : 'focus'}
        />
      </div>

      {expanded && (
        <div className="row-body">
          {task.description && <div className="row-desc">{task.description}</div>}
          {subtasks.length > 0 && (
            <ul className="subtasks">
              {subtasks.map((s) => (
                <li key={s.id}>
                  <button className={`subcheck${s.status === 'done' ? ' done' : ''}`} onClick={() => onSubtaskToggle(s)}>
                    <span className="box">{s.status === 'done' ? '✓' : ''}</span>
                    <span className="sub-title mono">{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addingSub ? (
            <input
              ref={subRef}
              className="add-sub-input mono"
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              disabled={addBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitSubtask();
                } else if (e.key === 'Escape') {
                  setAddingSub(false);
                  setSubDraft('');
                }
              }}
              onBlur={() => {
                if (!subDraft.trim()) setAddingSub(false);
              }}
              placeholder="New subtask — Enter to add"
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
            />
          ) : (
            <button className="add-sub-btn" onClick={() => setAddingSub(true)} type="button">
              + subtask
            </button>
          )}
          <div className="row-actions">
            {isDone ? (
              <button className="act primary" onClick={onReopen} disabled={busy}>Reopen</button>
            ) : (
              <button className="act primary" onClick={onComplete} disabled={busy}>Mark done</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityDot({ priority, status }: { priority: Task['priority']; status: Task['status'] }) {
  const color =
    priority === 'high' ? 'var(--priority-high)' :
    priority === 'medium' ? 'var(--priority-medium)' :
    'var(--priority-low)';
  // Filled when status !== 'todo' (TUI parity). The `done` variant is
  // visually distinguished from `in_progress` (session-linked) by a ✓
  // glyph + extra desaturation handled in CSS.
  const filled = status !== 'todo';
  const isDone = status === 'done';
  return (
    <span
      className={`prio-dot ${filled ? 'filled' : 'outline'}${isDone ? ' done' : ''}`}
      style={filled ? { background: color } : { borderColor: color }}
      aria-label={`priority ${priority}, status ${status}`}
    >
      {isDone && <span className="prio-dot-check" aria-hidden="true">✓</span>}
    </span>
  );
}

function Toggle({
  on, busy, onChange, ariaLabel,
}: {
  on: boolean;
  busy?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      onClick={onChange}
      disabled={busy}
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
    >
      <span className="toggle-knob" />
    </button>
  );
}
