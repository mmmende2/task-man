import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { buildRefineQueue } from 'task-man/refine-queue';
import { loadScopeFilter, matchesScope } from './ScopeChip';
import './NavMenu.css';

type Current = 'focus' | 'backlog' | 'capture' | 'refine' | 'metrics' | 'status';

interface Props {
  current: Current;
}

interface Item {
  key: Current;
  label: string;
  to?: string;
  soon?: boolean;
}

const NAV_ITEMS: Item[] = [
  { key: 'focus', label: 'Focus', to: '/' },
  { key: 'backlog', label: 'Backlog', to: '/backlog' },
  { key: 'capture', label: 'Capture', to: '/capture' },
  { key: 'refine', label: 'Refine', to: '/refine' },
  { key: 'metrics', label: 'Metrics', to: '/metrics' },
];

export function NavMenu({ current }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [refineCount, setRefineCount] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Refine candidate count, computed only while the menu is open so it costs
  // one list fetch per open — not a poll on every page. Scoped to the active
  // scope chip, mirroring what the Refine page itself will queue.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const scope = loadScopeFilter();
    api
      .listTasks()
      .then((tasks) => {
        if (!live) return;
        const candidates = tasks.filter((t) => matchesScope(t.scope, scope));
        setRefineCount(buildRefineQueue(candidates).length);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  // Deployed server version, shown at the bottom of the menu. Fetched on open
  // (once fetched, kept — the version only changes on redeploy + reload).
  useEffect(() => {
    if (!open || version !== null) return;
    let live = true;
    api
      .getHealth()
      .then((h) => { if (live) setVersion(h.version); })
      .catch(() => {});
    return () => { live = false; };
  }, [open, version]);

  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };

  return (
    <div className="nav-menu">
      <button
        className={`nav-menu-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="open menu"
        aria-haspopup="menu"
        aria-expanded={open}
        type="button"
      >
        <NavIcon />
      </button>
      {open && (
        <>
          <div className="nav-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="nav-menu-panel" role="menu" ref={panelRef}>
            {NAV_ITEMS.map((it) => {
              const isCurrent = it.key === current;
              return (
                <button
                  key={it.key}
                  className={`nav-menu-item${isCurrent ? ' current' : ''}`}
                  onClick={() => it.to && !it.soon && go(it.to)}
                  disabled={!!it.soon}
                  type="button"
                  role="menuitem"
                >
                  <span>{it.label}</span>
                  {it.key === 'refine' && refineCount != null && refineCount > 0 && (
                    <span className="nav-menu-item-count">{refineCount}</span>
                  )}
                  {it.soon && <span className="nav-menu-item-soon">soon</span>}
                </button>
              );
            })}
            {/* Version footer doubles as the entry to the status page. */}
            <button
              className={`nav-menu-version${current === 'status' ? ' current' : ''}`}
              onClick={() => go('/status')}
              type="button"
              role="menuitem"
            >
              <span>task-man {version ? `v${version}` : ''}</span>
              <span className="nav-menu-version-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Mirrors web/public/icon.svg — three pink strokes with cyan/purple
// dots at the left. Doubles as a "menu" affordance.
function NavIcon() {
  return (
    <svg className="nav-menu-icon" viewBox="0 0 22 22" aria-hidden="true">
      <g stroke="#ff79c6" strokeWidth="1.8" strokeLinecap="round">
        <line x1="7" y1="6.5" x2="18" y2="6.5" />
        <line x1="7" y1="11" x2="16" y2="11" />
        <line x1="7" y1="15.5" x2="14" y2="15.5" />
      </g>
      <circle cx="4.5" cy="6.5" r="1.4" fill="#00e5ff" />
      <circle cx="4.5" cy="11" r="1.4" fill="#00e5ff" />
      <circle cx="4.5" cy="15.5" r="1.4" fill="#bd93f9" />
    </svg>
  );
}
