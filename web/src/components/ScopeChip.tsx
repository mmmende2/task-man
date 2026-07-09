import type { TaskScope } from '../types';
import './ScopeChip.css';

// Scope filter chip shared by Focus and Backlog. Tap to cycle
// all → personal → professional. Persisted in localStorage under one key so
// the filter survives across sessions (close the tab, reopen, still set) and
// the pages stay in sync. Deliberately no `storage` event listener —
// cross-tab live sync is not required.

export type ScopeFilter = 'all' | TaskScope;

const SCOPE_CYCLE: ScopeFilter[] = ['all', 'personal', 'professional'];
const STORAGE_KEY = 'scopeFilter';

export function loadScopeFilter(): ScopeFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'personal' || raw === 'professional') return raw;
    // One-shot migration from the old sessionStorage home. If a valid value
    // is there, promote it to localStorage and clear the old key.
    const legacy = sessionStorage.getItem(STORAGE_KEY);
    if (legacy === 'personal' || legacy === 'professional') {
      localStorage.setItem(STORAGE_KEY, legacy);
      sessionStorage.removeItem(STORAGE_KEY);
      return legacy;
    }
    return 'all';
  } catch {
    return 'all';
  }
}

export function saveScopeFilter(v: ScopeFilter) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* localStorage full or disabled — filter just won't persist */
  }
}

export function nextScopeFilter(v: ScopeFilter): ScopeFilter {
  return SCOPE_CYCLE[(SCOPE_CYCLE.indexOf(v) + 1) % SCOPE_CYCLE.length];
}

/** True when `taskScope` passes the filter. */
export function matchesScope(taskScope: TaskScope, filter: ScopeFilter): boolean {
  return filter === 'all' || taskScope === filter;
}

const LABELS: Record<ScopeFilter, string> = {
  all: 'all',
  personal: 'personal',
  professional: 'professional',
};

export function ScopeChip({ value, onChange }: { value: ScopeFilter; onChange: (v: ScopeFilter) => void }) {
  return (
    <button
      className={`scope-chip${value !== 'all' ? ' active' : ''}`}
      onClick={() => onChange(nextScopeFilter(value))}
      type="button"
      aria-label={`scope filter: ${LABELS[value]} — tap to change`}
    >
      {LABELS[value]}
    </button>
  );
}
