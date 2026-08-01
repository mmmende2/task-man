import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, reloadForAuth } from '../api';
import type { TaskPriority, TaskScope } from '../types';
import { NavMenu } from '../components/NavMenu';
import { loadScopeFilter } from '../components/ScopeChip';
import './Capture.css';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];
const TIME_ESTIMATES = ['<5m', '20m', '45m', '>1h', '>3h'] as const;
type TimeEstimate = (typeof TIME_ESTIMATES)[number];
const SCOPES: TaskScope[] = ['personal', 'professional'];

/**
 * The scope a fresh capture starts on: whatever the app-wide filter is set to
 * ('all' → no pre-selection). Used for the initial state AND for the reset
 * after each capture — resetting to null instead made scope the one field you
 * had to re-pick every single time.
 */
function defaultScope(): TaskScope | null {
  const f = loadScopeFilter();
  return f === 'all' ? null : f;
}

/**
 * Back out of the edit form. Normally that's the row you came from, but a
 * deep-linked /task/:id has nothing behind it — `nav(-1)` there walks out of
 * the app entirely, so fall back to the list.
 */
function useGoBack() {
  const nav = useNavigate();
  return () => {
    // react-router stamps its history index onto history.state.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav('/');
  };
}

/**
 * Capture, and — when the route carries a task id (`/task/:id`) — edit.
 * Deliberately one component: an edit form that drifts from the capture form
 * is how the two end up disagreeing about what a task even has.
 */
export function CapturePage() {
  const nav = useNavigate();
  const goBack = useGoBack();
  const { id: editId } = useParams();
  const editing = !!editId;
  const [loading, setLoading] = useState(editing);
  const [title, setTitle] = useState('');
  // Priority is now nullable — no implicit default. Tap a segment to
  // set it, tap the active segment again to clear. When null we omit
  // the field on submit and the server falls back to 'medium'.
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [time, setTime] = useState<TimeEstimate | null>(null);
  // Scope follows the priority pattern: nullable, tap-again-to-clear.
  // When null we omit it and the server defaults to 'personal'.
  // Note: the Segmented control only sets THIS task's scope — it never writes
  // back through saveScopeFilter, so capturing doesn't move the app-wide
  // filter. Changing it on an existing task moves that task out of the
  // filtered view, which is the point.
  const [scope, setScope] = useState<TaskScope | null>(defaultScope);
  const [focused, setFocused] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const newCatRef = useRef<HTMLInputElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Pills mirror the task's scope: professional capture → professional
    // categories only. Scope null ('all') → unfiltered list. Refetches when
    // the Segmented control changes scope mid-capture.
    api.listCategories(scope ?? undefined)
      .then((cs) => setKnownCategories(cs.map((c) => c.name)))
      .catch(() => {
        /* harmless — user can still add categories ad-hoc */
      });
  }, [scope]);

  // Edit mode: prefill from the task. Existing subtasks are managed from the
  // row itself (tap to tick), so the subtask control here only ever queues
  // NEW ones — same as capture.
  useEffect(() => {
    if (!editId) return;
    let stale = false;
    api.getTask(editId)
      .then((t) => {
        if (stale) return;
        setTitle(t.title);
        setPriority(t.priority);
        setScope(t.scope);
        setTime((t.time_estimate as TimeEstimate | null) ?? null);
        setCategories(t.categories ?? []);
        setFocused(t.focused);
        setDescription(t.description ?? '');
        setShowDesc(!!t.description);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return reloadForAuth();
        setToast('Could not load that task');
        setLoading(false);
      });
    return () => { stale = true; };
  }, [editId]);

  useEffect(() => {
    // Capture only. Autofocusing an edit pops the keyboard over a form you
    // came to read, and parks the caret at the end of the title — which
    // scrolls a long one so only its tail is visible.
    if (!editing) titleRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (addingCategory) newCatRef.current?.focus();
  }, [addingCategory]);

  useEffect(() => {
    if (showSubtasks) subtaskInputRef.current?.focus();
  }, [showSubtasks]);

  const toggleCategory = (c: string) => {
    setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  };

  const addNewCategory = () => {
    const v = newCategory.trim();
    if (!v) {
      setAddingCategory(false);
      return;
    }
    setCategories((cs) => (cs.includes(v) ? cs : [...cs, v]));
    setKnownCategories((cs) => (cs.includes(v) ? cs : [v, ...cs]));
    setNewCategory('');
    setAddingCategory(false);
  };

  const queueSubtask = () => {
    const v = subtaskDraft.trim();
    if (!v) return;
    setSubtasks((s) => [...s, v]);
    setSubtaskDraft('');
    // Leave focus on the input — phone "checklist mode".
  };

  const removeSubtask = (i: number) => setSubtasks((s) => s.filter((_, idx) => idx !== i));

  const save = async () => {
    const cleanTitle = title.trim();
    if (busy || !cleanTitle || !editId) return;
    setBusy(true);
    const newSubtasks = subtaskDraft.trim() ? [...subtasks, subtaskDraft.trim()] : subtasks;
    try {
      await api.patchTask(editId, {
        title: cleanTitle,
        // Every field is sent explicitly: this is an edit, so "unset" has to
        // be able to travel. null clears the description; priority and scope
        // aren't clearable while editing (a task always has both).
        priority: priority ?? undefined,
        scope: scope ?? undefined,
        categories,
        description: description.trim() || null,
        focused,
        time_estimate: time,
      });
      await Promise.allSettled(
        newSubtasks.map((s) => api.createTask({ title: s, parent_id: editId, focused: false })),
      );
      goBack();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        reloadForAuth();
        return;
      }
      setToast((err as Error).message || 'Failed to save');
      setTimeout(() => setToast(null), 1800);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (editing) return save();
    const cleanTitle = title.trim();
    if (busy || !cleanTitle) return;
    setBusy(true);
    const allSubtasks = subtaskDraft.trim() ? [...subtasks, subtaskDraft.trim()] : subtasks;
    try {
      const parent = await api.createTask({
        title: cleanTitle,
        // Omit priority/scope when null so the server defaults apply.
        priority: priority ?? undefined,
        scope: scope ?? undefined,
        categories: categories.length ? categories : undefined,
        description: description.trim() || undefined,
        focused,
        time_estimate: time,
      });
      const results = await Promise.allSettled(
        allSubtasks.map((s) =>
          api.createTask({ title: s, parent_id: parent.id, focused: false }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = allSubtasks.length - failed;
      const subSuffix =
        allSubtasks.length === 0
          ? ''
          : failed === 0
            ? ` (+${ok} subtask${ok === 1 ? '' : 's'})`
            : ` (+${ok}, ${failed} failed)`;
      setToast(`Captured: ${parent.title}${subSuffix}`);

      setTitle('');
      setDescription('');
      setShowDesc(false);
      setCategories([]);
      setTime(null);
      setPriority(null);
      // Back to the app-wide scope, not to nothing — see defaultScope().
      setScope(defaultScope());
      setFocused(true);
      setSubtasks([]);
      setSubtaskDraft('');
      setShowSubtasks(false);
      setTimeout(() => setToast(null), 1800);
      titleRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        reloadForAuth();
        return;
      }
      setToast((err as Error).message || 'Failed to capture');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="capture-page">
      <header className="capture-header">
        <button
          className="back-btn"
          onClick={() => (editing ? goBack() : nav('/'))}
          aria-label="back"
        >
          ←
        </button>
        <div className="capture-title">{editing ? 'Edit' : 'Capture'}</div>
        <NavMenu current="capture" />
      </header>

      <main className="capture-body">
        <input
          ref={titleRef}
          className="capture-input mono"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="send"
        />

        {/* ── Categories: the most-used field, surface it first ── */}
        <div className="control">
          <span className="control-label">Categories</span>
          <div className="pill-row">
            {knownCategories.map((c) => (
              <button
                key={c}
                className={`pill${categories.includes(c) ? ' active' : ''}`}
                onClick={() => toggleCategory(c)}
                type="button"
              >
                {c}
              </button>
            ))}
            {categories
              .filter((c) => !knownCategories.includes(c))
              .map((c) => (
                <button key={c} className="pill active" onClick={() => toggleCategory(c)} type="button">
                  {c}
                </button>
              ))}
            {addingCategory ? (
              <input
                ref={newCatRef}
                className="pill-input mono"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onBlur={addNewCategory}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewCategory();
                  } else if (e.key === 'Escape') {
                    setNewCategory('');
                    setAddingCategory(false);
                  }
                }}
                placeholder="name"
              />
            ) : (
              <button
                className="pill pill-add"
                onClick={() => setAddingCategory(true)}
                type="button"
              >
                + new
              </button>
            )}
          </div>
        </div>

        {/* ── Subtasks: second-most-used; promoted to a large button. ── */}
        {showSubtasks ? (
          <div className="control">
            <span className="control-label">Subtasks</span>
            {subtasks.length > 0 && (
              <div className="subtask-chips">
                {subtasks.map((s, i) => (
                  <span key={`${s}-${i}`} className="subtask-chip">
                    <span className="subtask-chip-text mono">{s}</span>
                    <button
                      className="subtask-chip-x"
                      onClick={() => removeSubtask(i)}
                      type="button"
                      aria-label={`remove subtask ${s}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={subtaskInputRef}
              className="capture-input mono subtask-input"
              value={subtaskDraft}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  queueSubtask();
                } else if (e.key === 'Escape' && !subtaskDraft) {
                  setShowSubtasks(false);
                }
              }}
              placeholder={subtasks.length ? 'Add another, or Enter twice to finish' : 'First subtask…'}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
            />
            <span className="subtask-help">Enter to add • × to remove</span>
          </div>
        ) : (
          <button className="add-subtasks-btn" onClick={() => setShowSubtasks(true)} type="button">
            <span className="plus-glyph">+</span> Add subtasks
          </button>
        )}

        <Segmented
          label="Priority"
          options={PRIORITIES}
          // Only clearable on capture, where null means "let the server
          // default apply". An existing task always has a priority, so there
          // is nothing to clear it to.
          value={priority}
          onChange={(v) => setPriority(v === priority && !editing ? null : v)}
          variant="priority"
          clearable={!editing}
        />

        <Segmented
          label="Time"
          options={TIME_ESTIMATES}
          value={time}
          onChange={(v) => setTime(v === time ? null : v)}
          variant="time"
          clearable
        />

        <Segmented
          label="Scope"
          options={SCOPES}
          value={scope}
          onChange={(v) => setScope(v === scope && !editing ? null : v)}
          variant="scope"
          clearable={!editing}
        />

        <div className="control control-row">
          <span className="control-label">Focused</span>
          <Toggle on={focused} onChange={setFocused} />
        </div>

        {showDesc ? (
          <div className="control">
            <span className="control-label">Description</span>
            <textarea
              className="capture-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </div>
        ) : (
          <button className="add-note" onClick={() => setShowDesc(true)} type="button">
            + Add description
          </button>
        )}
      </main>

      <nav className="capture-bottom">
        <button className="capture-submit" onClick={submit} disabled={busy || loading || !title.trim()}>
          {editing
            ? (busy ? 'Saving…' : 'Save')
            : (busy ? 'Capturing…' : 'Capture')}
        </button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  variant: 'priority' | 'time' | 'scope';
  clearable?: boolean;
}

function Segmented<T extends string>({ label, options, value, onChange, variant, clearable }: SegmentedProps<T>) {
  return (
    <div className="control">
      <span className="control-label">
        {label}
        {clearable && value !== null && (
          <span className="control-clear-hint">tap again to clear</span>
        )}
      </span>
      <div className={`segmented seg-${variant}`}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              className={`segment${active ? ' active' : ''}`}
              onClick={() => onChange(opt)}
              type="button"
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      type="button"
      aria-pressed={on}
    >
      <span className="toggle-knob" />
    </button>
  );
}
