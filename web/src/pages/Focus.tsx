import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { Task } from '../types';
import { usePoll } from '../lib/use-poll';
import { NavMenu } from '../components/NavMenu';
import { Brand } from '../components/Brand';
// 'focus' sort = priority desc, then updated_at desc. The server
// applies it via ?sort=focus; we then partition parents/subtasks
// from the same payload client-side.
import { sortTasks } from 'task-man/handlers';
// Shared local-midnight retention rule — same source of truth the TUI uses
// (see cli/src/local-date.ts comment for the timezone bug it fixes).
import { isLocalToday } from 'task-man/local-date';
import './Focus.css';

// SCOPE filter intentionally disabled in the UI — bring back the
// import + ScopeChip + cycle handler if the user starts caring about
// per-scope filtering again. Data field on Task still exists.
//   import type { TaskScope } from '../types';
//   type ScopeFilter = 'all' | TaskScope;
//   const SCOPE_CYCLE: ScopeFilter[] = ['all', 'personal', 'professional'];

export function FocusPage() {
  const nav = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // One fetch covers parents + subtasks; client groups them. We
  // include done tasks here and let the retention rule below decide
  // what to surface — done parents stay on screen through the user's
  // local "today", matching the TUI.
  const fetcher = useCallback(async () => {
    try {
      return await api.listTasks();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        nav('/login', { replace: true });
      }
      throw err;
    }
  }, [nav]);

  const { data: tasks, error, loading, failures, refresh } = usePoll(fetcher, 2000);

  const { focused, subtasksByParent } = useMemo(() => {
    const subs = new Map<string, Task[]>();
    const parents: Task[] = [];
    for (const t of tasks ?? []) {
      if (t.parent_id) {
        const arr = subs.get(t.parent_id) ?? [];
        arr.push(t);
        subs.set(t.parent_id, arr);
      } else if (t.focused) {
        // Retention: keep done parents on screen if completed today
        // (local time). Same rule as the TUI.
        if (t.status !== 'done' || isLocalToday(t.completed_at)) {
          parents.push(t);
        }
      }
    }
    return { focused: sortTasks(parents, 'focus'), subtasksByParent: subs };
  }, [tasks]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
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

  return (
    <div className="focus-page">
      <header className="focus-header">
        <Brand />
        <NavMenu current="focus" />
      </header>

      {showConnectionError && (
        <div className="conn-error">
          Server unreachable.
          <button onClick={() => refresh()} className="conn-retry">Retry</button>
        </div>
      )}

      <main className="focus-list">
        {loading && !tasks && <div className="empty">Loading…</div>}
        {tasks && focused.length === 0 && (
          <div className="empty">
            No focused tasks. <br />
            <span className="dim">
              Capture one, or focus a task from the{' '}
              <button className="inline-link" onClick={() => nav('/backlog')}>backlog</button>.
            </span>
          </div>
        )}
        {focused.map((t) => (
          <FocusRow
            key={t.id}
            task={t}
            subtasks={subtasksByParent.get(t.id) ?? []}
            expanded={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            busy={acting.has(t.id)}
            onComplete={() => withAction(t.id, async () => { await api.complete(t.id); flashToast('Done ✓'); })}
            onReopen={() => withAction(t.id, async () => { await api.patchTask(t.id, { status: 'todo' }); flashToast('Reopened'); })}
            onUnfocus={() => withAction(t.id, async () => { await api.unfocus(t.id); flashToast('Sent to backlog'); })}
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
        ))}
      </main>

      <nav className="focus-bottom">
        <button className="capture-btn" onClick={() => nav('/capture')}>
          <span className="plus">+</span> Capture
        </button>
      </nav>

      {error && !showConnectionError && <div className="toast error">{error.message}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

interface RowProps {
  task: Task;
  subtasks: Task[];
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onUnfocus: () => void;
  onSubtaskToggle: (sub: Task) => void;
  onAddSubtask: (title: string) => Promise<boolean>;
}

function FocusRow({ task, subtasks, expanded, busy, onToggle, onComplete, onReopen, onUnfocus, onSubtaskToggle, onAddSubtask }: RowProps) {
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

  // Collapse the add-subtask UI when the row itself collapses.
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
      // Only clear + stay in adding mode on success. On failure leave
      // the draft so the user can retry without re-typing.
      setSubDraft('');
      subRef.current?.focus();
    }
  };

  return (
    <div className={`focus-row${expanded ? ' expanded' : ''}${busy ? ' busy' : ''}${isDone ? ' done' : ''}`}>
      <button className="row-head" onClick={onToggle}>
        <PriorityDot priority={task.priority} status={task.status} />
        <div className="row-title-block">
          <div className="row-title mono">{task.title}</div>
          {task.status === 'in_progress' && <div className="row-status">in progress</div>}
          {isDone && <div className="row-status done-stamp">done today</div>}
        </div>
        <div className="row-side">
          {task.categories.slice(0, 2).map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
          {subTotal > 0 && (
            <span className="sub-progress mono">
              {subDone}/{subTotal}
            </span>
          )}
        </div>
      </button>
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
            <button className="act ghost" onClick={onUnfocus} disabled={busy}>Unfocus</button>
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
