import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, reloadForAuth } from '../api';
import type { Task, TaskPriority, TaskScope } from '../types';
import { NavMenu } from '../components/NavMenu';
import { buildRefineCandidates } from 'task-man/refine-queue';
import { buildQuestions, type QuestionDef } from 'task-man/refine-questions';
import { localDateString } from 'task-man/local-date';
import { ScopeChip, loadScopeFilter, saveScopeFilter, matchesScope, type ScopeFilter } from '../components/ScopeChip';
import './Refine.css';

type Phase = 'loading' | 'asking' | 'complete' | 'empty' | 'error';

interface UndoSnapshot {
  taskId: string;
  changes: Partial<Task>;
}

const FLASH_MS = 240;

// Cap the cards you walk in one sitting. The uncapped candidate set (see
// NavMenu's badge) is the honest *total* still needing refine, but walking
// every one in a single session reads as "this never ends" — so a session
// takes the top slice (priority-sorted) and the complete screen shows what's
// left. Each answer is persisted the instant it's given (patchTask), so a
// partial session loses nothing.
const SESSION_MAX = 20;

// Focus-nomination budget. The "Pull this into tomorrow's focus?" card is
// capped per *day*, not per session: a plain useRef reset every time you
// re-open Refine, so the card came back a couple of cards in, every visit —
// "constantly". Persisting the count keyed on the local date holds the cap
// across remounts, navigations, and reloads.
const FOCUS_ASKS_PER_DAY = 2;
const FOCUS_BUDGET_KEY = 'refineFocusAsks';

function loadFocusAsks(today: string): number {
  try {
    const raw = localStorage.getItem(FOCUS_BUDGET_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    return parsed.date === today ? parsed.count ?? 0 : 0;
  } catch {
    return 0;
  }
}

function saveFocusAsks(today: string, count: number): void {
  try {
    localStorage.setItem(FOCUS_BUDGET_KEY, JSON.stringify({ date: today, count }));
  } catch {
    /* storage full/disabled — the cap just won't persist */
  }
}

// Which task field an answer writes, keyed off the question's prompt — the
// exact same prefix routing the TUI uses (RefineMode.tsx), kept identical so
// the two surfaces can't drift on what a card means.
function answerToChange(prompt: string, value: string, task: Task): Partial<Task> | null {
  if (prompt.startsWith('Quick fix')) return { title: value };
  if (prompt.startsWith('Work thing')) return { scope: value as TaskScope };
  if (prompt.startsWith('How long')) return { time_estimate: value as Task['time_estimate'] };
  if (prompt.startsWith('Vibe check')) return { vibe: value as Task['vibe'] };
  if (prompt.startsWith('How urgent')) return { priority: value as TaskPriority };
  if (prompt.startsWith('File this')) return { categories: [...task.categories, value] };
  return null;
}

export function RefinePage() {
  const nav = useNavigate();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(() => loadScopeFilter());

  // The immutable fetch snapshot. We patch entries in place on apply/undo so
  // question-gating (buildQuestions) always sees fresh state, but we never
  // re-fetch mid-session — cards must not reshuffle under your thumb.
  const [snapshot, setSnapshot] = useState<Task[] | null>(null);
  // Frozen review order (task IDs). Rebuilt only when the snapshot first
  // lands or the scope chip changes — both deliberate, never mid-card.
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [reviewedCount, setReviewedCount] = useState(0);
  // Full candidate count for this scope (before the SESSION_MAX slice), so the
  // complete screen can honestly say how many still need refine.
  const [totalCandidates, setTotalCandidates] = useState(0);

  const [lastAction, setLastAction] = useState<UndoSnapshot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const changeScopeFilter = (v: ScopeFilter) => {
    setScopeFilter(v);
    saveScopeFilter(v);
  };

  // One fetch on entry.
  useEffect(() => {
    let alive = true;
    api.listTasks()
      .then((tasks) => { if (alive) setSnapshot(tasks); })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { reloadForAuth(); return; }
        if (alive) { setErrMsg((err as Error).message || 'Failed to load'); setPhase('error'); }
      });
    return () => { alive = false; };
  }, []);

  // Build the review queue ONCE per (load, scope). It must NOT rebuild on the
  // per-answer snapshot mutations: re-filtering candidates mid-review would
  // yank the queue out from under you — answering a task's last gap drops it
  // from the candidate set, collapsing the queue and resetting progress.
  // `snapshot` stays in deps so the first non-null load triggers a build; the
  // ref guard suppresses every subsequent same-scope run.
  const queueBuiltForScope = useRef<ScopeFilter | null>(null);
  // How many focus questions ("Pull this into tomorrow's focus?") have been
  // charged today. Seeded from (and written back to) localStorage so the
  // per-day cap survives remounts and reloads (see FOCUS_BUDGET_KEY).
  const focusAsksUsed = useRef(loadFocusAsks(localDateString()));
  useEffect(() => {
    if (!snapshot) return;
    if (queueBuiltForScope.current === scopeFilter) return;
    queueBuiltForScope.current = scopeFilter;
    // Re-read the day's budget rather than resetting it — a scope switch is
    // still the same day's session.
    focusAsksUsed.current = loadFocusAsks(localDateString());
    const candidates = buildRefineCandidates(
      snapshot.filter((t) => matchesScope(t.scope, scopeFilter)),
    );
    setTotalCandidates(candidates.length);
    // Walk only the top slice this session; the badge still shows the full
    // total and the complete screen reports the remainder.
    const ids = candidates.slice(0, SESSION_MAX).map((t) => t.id);
    setQueueIds(ids);
    setTaskIndex(0);
    setQuestionIndex(0);
    setReviewedCount(0);
    setLastAction(null);
    setPhase(ids.length === 0 ? 'empty' : 'asking');
  }, [snapshot, scopeFilter]);

  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of snapshot ?? []) m.set(t.id, t);
    return m;
  }, [snapshot]);

  // Every category in use, for the "File this under…?" card's dropdown — the
  // card's quick buttons only surface the first few, so a less-common category
  // was unreachable without this.
  const allCategories = useMemo(
    () => Array.from(new Set((snapshot ?? []).flatMap((t) => t.categories))).sort(),
    [snapshot],
  );

  const currentTaskId = queueIds[taskIndex];
  const currentTask: Task | undefined = tasksById.get(currentTaskId);

  // The frozen question list for the current task. Built ONCE when a task
  // becomes current and walked by index — never rebuilt as answers mutate
  // the snapshot. Rebuilding-on-answer would drop the just-answered card and
  // shift the survivors down while the flash timer still bumps the index,
  // skipping the next card; and when the list emptied it raced the
  // task-advance, skipping into the following task. Freezing removes that
  // whole class of skips.
  const [activeQuestions, setActiveQuestions] = useState<QuestionDef[]>([]);
  const snapshotRef = useRef<Task[] | null>(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const advanceTask = useCallback(() => {
    // Cancel any pending flash-advance so a stale timer can't bump the index
    // on the *next* task after we've moved on.
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    setActiveQuestions([]);
    setReviewedCount((c) => c + 1);
    setQuestionIndex(0);
    setEditing(false);
    setLastAction(null);
    setTaskIndex((i) => {
      const next = i + 1;
      if (next >= queueIds.length) setPhase('complete');
      return next;
    });
  }, [queueIds.length]);

  // Freeze the list when a task becomes current. Reads the live snapshot via
  // ref (so prior-task edits show through) but is keyed only on task identity,
  // so it does not re-run as the current task's own fields change.
  useEffect(() => {
    if (phase !== 'asking' || !currentTaskId) return;
    const snap = snapshotRef.current ?? [];
    const task = snap.find((t) => t.id === currentTaskId);
    if (!task) { advanceTask(); return; }
    const focused = snap.filter((t) => t.focused && t.status !== 'done').length;
    const cats = Array.from(new Set(snap.flatMap((t) => t.categories)));
    // No local focus cap on the web (see the plan's "no focus limit" ruling):
    // threshold null means the focus card is offered with no warning note.
    // suppressFocusQuestion enforces the per-day cap of FOCUS_ASKS_PER_DAY.
    const qs = buildQuestions(
      task, snap, focused, null, cats, focusAsksUsed.current >= FOCUS_ASKS_PER_DAY,
    );
    // Charge an ask only for a focus card that actually SURVIVED the
    // 3-question slice (a task with 3 earlier questions may have it sliced
    // off — don't spend the budget on an unshown card). Persist immediately so
    // the cap holds across sessions. Undo does not refund the ask (accepted).
    if (qs.some((q) => q.prompt.startsWith('Pull this into'))) {
      focusAsksUsed.current += 1;
      saveFocusAsks(localDateString(), focusAsksUsed.current);
    }
    setActiveQuestions(qs);
    setQuestionIndex(0);
    if (qs.length === 0) advanceTask();
  }, [currentTaskId, phase, advanceTask]);

  const currentQuestion = activeQuestions[questionIndex];

  // Walked past the end of a task's frozen list → next task. (The empty-list
  // case is handled at freeze time above.)
  useEffect(() => {
    if (phase !== 'asking') return;
    if (activeQuestions.length > 0 && questionIndex >= activeQuestions.length) advanceTask();
  }, [phase, questionIndex, activeQuestions.length, advanceTask]);

  const flashAndAdvance = useCallback((label: string) => {
    setFlash(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      setQuestionIndex((i) => i + 1);
    }, FLASH_MS);
  }, []);

  const skipQuestion = useCallback(() => {
    setLastAction(null);
    flashAndAdvance('skipped');
  }, [flashAndAdvance]);

  const skipTask = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    advanceTask();
  }, [advanceTask]);

  const applyChange = useCallback(
    async (changes: Partial<Task>, label: string) => {
      if (!currentTask || busy) return;
      const prev: Partial<Task> = {};
      for (const key of Object.keys(changes) as (keyof Task)[]) {
        (prev as Record<string, unknown>)[key] = currentTask[key];
      }
      setBusy(true);
      try {
        await api.patchTask(currentTask.id, changes);
        setSnapshot((s) => (s ?? []).map((t) => (t.id === currentTask.id ? { ...t, ...changes } : t)));
        setLastAction({ taskId: currentTask.id, changes: prev });
        setEditing(false);
        flashAndAdvance(label);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          flashToast('Task was removed — skipping');
          skipTask();
        } else if (err instanceof ApiError && err.status === 401) {
          reloadForAuth();
        } else {
          flashToast((err as Error).message || 'Failed');
        }
      } finally {
        setBusy(false);
      }
    },
    [currentTask, busy, flashAndAdvance, flashToast, skipTask],
  );

  const undoLast = useCallback(async () => {
    if (!lastAction || busy) return;
    setBusy(true);
    try {
      await api.patchTask(lastAction.taskId, lastAction.changes);
      setSnapshot((s) => (s ?? []).map((t) => (t.id === lastAction.taskId ? { ...t, ...lastAction.changes } : t)));
      setLastAction(null);
      flashToast('Undone');
    } catch (err) {
      flashToast((err as Error).message || 'Undo failed');
    } finally {
      setBusy(false);
    }
  }, [lastAction, busy, flashToast]);

  const trashCurrent = useCallback(async () => {
    if (!currentTask || busy) return;
    setBusy(true);
    try {
      await api.deleteTask(currentTask.id);
      setSnapshot((s) => (s ?? []).filter((t) => t.id !== currentTask.id));
      flashToast('Deleted');
      skipTask();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) { skipTask(); return; }
      flashToast((err as Error).message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }, [currentTask, busy, flashToast, skipTask]);

  const beginEdit = () => {
    if (!currentTask) return;
    setEditText(currentQuestion?.suggestion ?? currentTask.title);
    setEditing(true);
  };

  const onPick = (value: string, label: string) => {
    if (!currentQuestion || !currentTask) return;
    if (value === '__skip') return skipQuestion();
    const change = answerToChange(currentQuestion.prompt, value, currentTask);
    if (change) void applyChange(change, label);
  };

  // ── States without a card ────────────────────────────────
  if (phase === 'loading') {
    return <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}><div className="refine-empty">Loading…</div></Shell>;
  }
  if (phase === 'error') {
    return (
      <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}>
        <div className="refine-empty">
          {errMsg || 'Something went wrong.'}
          <button className="refine-link" onClick={() => nav('/')}>Back to Focus</button>
        </div>
      </Shell>
    );
  }
  if (phase === 'empty') {
    return (
      <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}>
        <div className="refine-empty">
          Nothing needs refine. <span className="refine-dim">Clean slate.</span>
          <button className="refine-link" onClick={() => nav('/')}>Back to Focus</button>
        </div>
      </Shell>
    );
  }
  if (phase === 'complete') {
    return (
      <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}>
        <div className="refine-empty">
          <div className="refine-complete-count">{reviewedCount} task{reviewedCount === 1 ? '' : 's'} reviewed.</div>
          {totalCandidates > reviewedCount ? (
            <span className="refine-dim">
              {totalCandidates - reviewedCount} still need refine — run again to keep going.
            </span>
          ) : (
            <span className="refine-dim">Clean slate.</span>
          )}
          <button className="refine-link" onClick={() => nav('/')}>Back to Focus</button>
        </div>
      </Shell>
    );
  }
  if (!currentTask || !currentQuestion) {
    return <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}><div className="refine-empty">…</div></Shell>;
  }

  // ── Asking ───────────────────────────────────────────────
  const meta = [
    currentTask.scope,
    currentTask.time_estimate ?? undefined,
    currentTask.vibe ?? undefined,
    ...currentTask.categories.slice(0, 2),
  ].filter(Boolean) as string[];

  return (
    <Shell scope={scopeFilter} onScope={changeScopeFilter} nav={nav}>
      <div className="refine-card">
        <div className="refine-progress mono">
          task {taskIndex + 1} / {queueIds.length} · question {questionIndex + 1} / {activeQuestions.length}
        </div>
        <div className="refine-task">
          <PriorityDot priority={currentTask.priority} />
          <span className="refine-task-title mono">{currentTask.title}</span>
        </div>
        {meta.length > 0 && (
          <div className="refine-meta">
            {meta.map((m, i) => <span key={`${m}-${i}`} className="refine-chip">{m}</span>)}
          </div>
        )}

        <div className="refine-prompt">{currentQuestion.prompt}</div>
        {currentQuestion.note && <div className="refine-note">⚠ {currentQuestion.note}</div>}
        {flash ? (
          <div className="refine-flash">✓ {flash}</div>
        ) : (
          <CardBody
            q={currentQuestion}
            allCategories={allCategories}
            busy={busy}
            editing={editing}
            editText={editText}
            onEditText={setEditText}
            onPick={onPick}
            onYes={() => void applyChange({ focused: true }, 'focused')}
            onNo={skipQuestion}
            onKeep={() => flashAndAdvance('kept')}
            onTrash={() => void trashCurrent()}
            onBeginEdit={beginEdit}
            onSaveEdit={() => {
              const t = editText.trim();
              if (t) void applyChange({ title: t }, 'edited');
              else setEditing(false);
            }}
            onCancelEdit={() => setEditing(false)}
          />
        )}
      </div>

      <div className="refine-footer">
        <button className="refine-foot-btn" onClick={skipQuestion} disabled={busy}>Skip question</button>
        <button className="refine-foot-btn" onClick={skipTask} disabled={busy}>Skip task</button>
        <button className="refine-foot-btn" onClick={() => void undoLast()} disabled={busy || !lastAction}>Undo</button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

// ── Layout shell shared by every phase ──────────────────────
function Shell({
  children, scope, onScope, nav,
}: {
  children: React.ReactNode;
  scope: ScopeFilter;
  onScope: (v: ScopeFilter) => void;
  nav: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="refine-page">
      <header className="refine-header">
        <button className="back-btn" onClick={() => nav('/')} aria-label="back">←</button>
        <div className="refine-header-title">Refine</div>
        <ScopeChip value={scope} onChange={onScope} />
        <NavMenu current="refine" />
      </header>
      <main className="refine-body">{children}</main>
    </div>
  );
}

interface CardBodyProps {
  q: QuestionDef;
  allCategories: string[];
  busy: boolean;
  editing: boolean;
  editText: string;
  onEditText: (v: string) => void;
  onPick: (value: string, label: string) => void;
  onYes: () => void;
  onNo: () => void;
  onKeep: () => void;
  onTrash: () => void;
  onBeginEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

function CardBody({
  q, allCategories, busy, editing, editText, onEditText, onPick, onYes, onNo, onKeep, onTrash, onBeginEdit, onSaveEdit, onCancelEdit,
}: CardBodyProps) {
  if (editing) {
    return (
      <div className="refine-edit">
        <input
          className="mono"
          value={editText}
          onChange={(e) => onEditText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSaveEdit(); }
            else if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <div className="refine-options">
          <button className="refine-opt" onClick={onSaveEdit} disabled={busy}>Save</button>
          <button className="refine-opt ghost" onClick={onCancelEdit} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  if (q.type === 'yesno') {
    return (
      <div className="refine-options">
        <button className="refine-opt primary" onClick={onYes} disabled={busy}>Yes</button>
        <button className="refine-opt ghost" onClick={onNo} disabled={busy}>No</button>
      </div>
    );
  }

  if (q.type === 'confirm') {
    return (
      <div className="refine-options">
        <button className="refine-opt primary" onClick={onKeep} disabled={busy}>Keep</button>
        <button className="refine-opt danger" onClick={onTrash} disabled={busy}>Trash</button>
        <button className="refine-opt ghost" onClick={onBeginEdit} disabled={busy}>Edit title</button>
      </div>
    );
  }

  if (q.type === 'correction') {
    return (
      <div className="refine-correction">
        <div className="refine-diff">
          <span className="refine-diff-old mono">{q.original}</span>
          <span className="refine-diff-arrow">↓</span>
          <span className="refine-diff-new mono">{q.suggestion}</span>
        </div>
        <div className="refine-options">
          <button className="refine-opt primary" onClick={() => onPick(q.suggestion ?? '', 'fixed')} disabled={busy}>Accept</button>
          <button className="refine-opt ghost" onClick={onNo} disabled={busy}>Keep original</button>
          <button className="refine-opt ghost" onClick={onBeginEdit} disabled={busy}>Edit</button>
        </div>
      </div>
    );
  }

  // number / list — a button per option. The category card ("File this
  // under…?") also gets a dropdown of *every* category, since its quick
  // buttons only surface the first few and the one you want may not be listed.
  const isCategory = q.prompt.startsWith('File this');
  const buttonValues = new Set((q.options ?? []).map((o) => o.value));
  const extraCategories = isCategory ? allCategories.filter((c) => !buttonValues.has(c)) : [];
  return (
    <div className="refine-options">
      {(q.options ?? []).map((opt) => (
        <button
          key={opt.value}
          className={`refine-opt${opt.value === '__skip' ? ' ghost' : ''}`}
          onClick={() => onPick(opt.value, `${opt.label}`)}
          disabled={busy}
        >
          {opt.label}
        </button>
      ))}
      {isCategory && extraCategories.length > 0 && (
        <select
          className="refine-select"
          value=""
          disabled={busy}
          onChange={(e) => { if (e.target.value) onPick(e.target.value, e.target.value); }}
          aria-label="Pick another category"
        >
          <option value="" disabled>Another category…</option>
          {extraCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function PriorityDot({ priority }: { priority: TaskPriority }) {
  const color =
    priority === 'high' ? 'var(--priority-high)' :
    priority === 'medium' ? 'var(--priority-medium)' :
    'var(--priority-low)';
  return <span className="refine-prio" style={{ background: color }} aria-label={`priority ${priority}`} />;
}
