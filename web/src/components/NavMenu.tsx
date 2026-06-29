import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './NavMenu.css';

type Current = 'focus' | 'backlog' | 'capture';

interface Props {
  current: Current;
}

interface Item {
  key: Current | 'metrics' | 'logout';
  label: string;
  to?: string;
  soon?: boolean;
}

const NAV_ITEMS: Item[] = [
  { key: 'focus', label: 'Focus', to: '/' },
  { key: 'backlog', label: 'Backlog', to: '/backlog' },
  { key: 'capture', label: 'Capture', to: '/capture' },
  { key: 'metrics', label: 'Metrics', soon: true },
];

export function NavMenu({ current }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };

  const logout = async () => {
    setOpen(false);
    try {
      await api.logout();
    } finally {
      // logout response is fire-and-forget for UX; route regardless.
      nav('/login', { replace: true });
    }
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
                  {it.soon && <span className="nav-menu-item-soon">soon</span>}
                </button>
              );
            })}
            <div className="nav-menu-sep" />
            <button
              className="nav-menu-item logout"
              onClick={logout}
              type="button"
              role="menuitem"
            >
              Log out
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
