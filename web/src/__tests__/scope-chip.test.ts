import { describe, it, expect, beforeEach } from 'vitest';
import { loadScopeFilter, saveScopeFilter, nextScopeFilter } from '../components/ScopeChip';

const KEY = 'scopeFilter';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ScopeChip persistence', () => {
  it('reads a saved value from localStorage', () => {
    saveScopeFilter('professional');
    expect(localStorage.getItem(KEY)).toBe('professional');
    expect(loadScopeFilter()).toBe('professional');
  });

  it('defaults to "all" when nothing is stored', () => {
    expect(loadScopeFilter()).toBe('all');
  });

  it('falls back to "all" for an invalid stored value', () => {
    localStorage.setItem(KEY, 'garbage');
    expect(loadScopeFilter()).toBe('all');
  });

  it('migrates a pre-existing sessionStorage value to localStorage once', () => {
    // Simulate the old (sessionStorage) home holding a value.
    sessionStorage.setItem(KEY, 'personal');
    expect(loadScopeFilter()).toBe('personal');
    // Promoted to localStorage and cleared from sessionStorage.
    expect(localStorage.getItem(KEY)).toBe('personal');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('ignores an invalid legacy sessionStorage value', () => {
    sessionStorage.setItem(KEY, 'garbage');
    expect(loadScopeFilter()).toBe('all');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('cycles all → personal → professional → all', () => {
    expect(nextScopeFilter('all')).toBe('personal');
    expect(nextScopeFilter('personal')).toBe('professional');
    expect(nextScopeFilter('professional')).toBe('all');
  });
});
