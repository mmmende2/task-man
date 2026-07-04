import type { TaskScope } from '../types';
import './ScopeChip.css';

// Scope filter chip shared by Focus and Backlog. Tap to cycle
// all → personal → professional. Persisted in sessionStorage under one
// key so the two pages stay in sync within a browsing session.

export type ScopeFilter = 'all' | TaskScope;

const SCOPE_CYCLE: ScopeFilter[] = ['all', 'personal', 'professional'];
const STORAGE_KEY = 'scopeFilter';

export function loadScopeFilter(): ScopeFilter {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw === 'personal' || raw === 'professional' ? raw : 'all';
  } catch {
    return 'all';
  }
}

export function saveScopeFilter(v: ScopeFilter) {
  try {
    sessionStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* sessionStorage full or disabled — filter just won't persist */
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
  professional: 'work',
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
