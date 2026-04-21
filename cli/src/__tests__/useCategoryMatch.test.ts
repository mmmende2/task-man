import { describe, it, expect } from 'vitest';
import {
  getAllCategories,
  levenshtein,
  suggestPrefix,
  suggestFuzzy,
  parseCategoryPartial,
} from '../ui/hooks/useCategoryMatch.js';
import type { Task } from '../types.js';

function mkTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'id',
    title: 't',
    description: null,
    status: 'todo',
    priority: 'medium',
    scope: 'personal',
    categories: [],
    parent_id: null,
    created_at: '2026-04-17',
    updated_at: '2026-04-17',
    completed_at: null,
    focused: false,
    created_by: 'human',
    session_id: null,
    time_estimate: null,
    vibe: null,
    ...overrides,
  };
}

describe('useCategoryMatch helpers', () => {
  it('levenshtein computes edit distance', () => {
    expect(levenshtein('house worrk', 'house work')).toBeLessThanOrEqual(2);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('getAllCategories ranks by count descending', () => {
    const tasks = [
      mkTask({ categories: ['House Work'] }),
      mkTask({ categories: ['House Work'] }),
      mkTask({ categories: ['Writing'] }),
      mkTask({ categories: ['House Work'] }),
    ];
    const cats = getAllCategories(tasks);
    expect(cats[0]).toEqual({ name: 'House Work', count: 3 });
    expect(cats[1]).toEqual({ name: 'Writing', count: 1 });
  });

  it('suggestPrefix returns top match case-insensitively', () => {
    const cats = [
      { name: 'House Work', count: 5 },
      { name: 'Writing', count: 2 },
    ];
    const { top, list } = suggestPrefix('hou', cats);
    expect(top?.name).toBe('House Work');
    expect(list.map(c => c.name)).toEqual(['House Work']);
  });

  it('suggestPrefix returns multiple matches ranked by count', () => {
    const cats = [
      { name: 'House Work', count: 5 },
      { name: 'House Prep', count: 3 },
      { name: 'Writing', count: 2 },
    ];
    const { top, list } = suggestPrefix('hou', cats);
    expect(top?.name).toBe('House Work');
    expect(list.map(c => c.name)).toEqual(['House Work', 'House Prep']);
  });

  it('suggestFuzzy returns typo match within Levenshtein 2', () => {
    const cats = [
      { name: 'House Work', count: 5 },
      { name: 'Writing', count: 2 },
    ];
    const result = suggestFuzzy('house worrk', cats);
    expect(result?.name).toBe('House Work');
  });

  it('suggestFuzzy returns null when partial is a prefix of an existing category', () => {
    const cats = [{ name: 'House Work', count: 1 }];
    expect(suggestFuzzy('house', cats)).toBeNull();
  });

  it('suggestFuzzy returns null when no category is close enough', () => {
    const cats = [{ name: 'Writing', count: 1 }];
    expect(suggestFuzzy('xyzabc', cats)).toBeNull();
  });

  describe('parseCategoryPartial', () => {
    it('finds partial after -c ', () => {
      expect(parseCategoryPartial('buy milk -c hou')).toBe('hou');
    });

    it('returns empty string when -c has only trailing space', () => {
      expect(parseCategoryPartial('buy milk -c ')).toBe('');
    });

    it('returns null when input does not end with -c token', () => {
      expect(parseCategoryPartial('buy milk -c foo ')).toBeNull();
      expect(parseCategoryPartial('buy milk')).toBeNull();
    });

    it('handles quoted partial', () => {
      expect(parseCategoryPartial('buy milk -c "house wor')).toBe('house wor');
    });

    it('finds partial on first -c occurrence only when trailing', () => {
      // -c token is only active if it's the last token being typed
      expect(parseCategoryPartial('-c hou')).toBe('hou');
    });
  });
});
