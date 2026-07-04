import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, reloadForAuth } from '../api';
import type { TaskPriority, TaskScope } from '../types';
import { NavMenu } from '../components/NavMenu';
import './Capture.css';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];
const TIME_ESTIMATES = ['<5m', '20m', '45m', '>1h', '>3h'] as const;
type TimeEstimate = (typeof TIME_ESTIMATES)[number];
const SCOPES: TaskScope[] = ['personal', 'professional'];

export function CapturePage() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  // Priority is now nullable — no implicit default. Tap a segment to
  // set it, tap the active segment again to clear. When null we omit
  // the field on submit and the server falls back to 'medium'.
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [time, setTime] = useState<TimeEstimate | null>(null);
  // Scope follows the priority pattern: nullable, tap-again-to-clear.
  // When null we omit it and the server defaults to 'personal'.
  const [scope, setScope] = useState<TaskScope | null>(null);
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
    api.listCategories()
      .then((cs) => setKnownCategories(cs.map((c) => c.name)))
      .catch(() => {
        /* harmless — user can still add categories ad-hoc */
      });
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

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

  const submit = async () => {
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
      setScope(null);
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
        <button className="back-btn" onClick={() => nav('/')} aria-label="back">←</button>
        <div className="capture-title">Capture</div>
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
          value={priority}
          // Priority is nullable: tap the active segment again to clear.
          onChange={(v) => setPriority(v === priority ? null : v)}
          variant="priority"
          clearable
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
          onChange={(v) => setScope(v === scope ? null : v)}
          variant="scope"
          clearable
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
        <button className="capture-submit" onClick={submit} disabled={busy || !title.trim()}>
          {busy ? 'Capturing…' : 'Capture'}
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
