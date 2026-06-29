import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import './CategoryFilterDrawer.css';

interface Props {
  active: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function CategoryFilterButton({ active, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`cat-filter-btn${active.size > 0 ? ' active' : ''}`}
        onClick={() => setOpen(true)}
        type="button"
        aria-label="filter by category"
      >
        <FunnelIcon />
        <span>Filter</span>
        {active.size > 0 && <span className="cat-filter-count">{active.size}</span>}
      </button>
      {open && (
        <CategoryFilterDrawer
          active={active}
          onCommit={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface DrawerProps {
  active: Set<string>;
  onCommit: (next: Set<string>) => void;
  onClose: () => void;
}

function CategoryFilterDrawer({ active, onCommit, onClose }: DrawerProps) {
  // Drafts let the user toggle without committing until "Done", and
  // "Clear" gives one-tap escape from an over-filtered state.
  const [draft, setDraft] = useState<Set<string>>(new Set(active));
  const [categories, setCategories] = useState<string[] | null>(null);

  useEffect(() => {
    api.listCategories()
      .then((cs) => setCategories(cs.map((c) => c.name)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (name: string) => {
    setDraft((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  };

  // Portal to document.body so the drawer isn't trapped by an
  // ancestor stacking/containing block (the Backlog header has
  // backdrop-filter: blur(), which anchors `position: fixed`
  // descendants to the header instead of the viewport).
  return createPortal(
    <>
      <div className="cat-drawer-backdrop" onClick={onClose} />
      <div className="cat-drawer" role="dialog" aria-label="filter by category">
        <div className="cat-drawer-handle" />
        <div className="cat-drawer-title">Filter by category</div>
        {categories === null ? (
          <div className="cat-drawer-empty">Loading…</div>
        ) : categories.length === 0 ? (
          <div className="cat-drawer-empty">No categories yet — add one when capturing a task.</div>
        ) : (
          <ul className="cat-drawer-list">
            {categories.map((c) => {
              const on = draft.has(c);
              return (
                <li key={c}>
                  <button
                    className={`cat-drawer-row${on ? ' active' : ''}`}
                    onClick={() => toggle(c)}
                    type="button"
                    aria-pressed={on}
                  >
                    <span className="cat-circle" aria-hidden="true" />
                    <span>{c}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="cat-drawer-footer">
          <button
            className="act ghost"
            onClick={() => setDraft(new Set())}
            type="button"
            disabled={draft.size === 0}
          >
            Clear
          </button>
          <button
            className="act primary"
            onClick={() => onCommit(draft)}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function FunnelIcon() {
  return (
    <svg className="cat-filter-funnel" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 3h12l-4.5 6v4l-3-1.5V9L2 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
