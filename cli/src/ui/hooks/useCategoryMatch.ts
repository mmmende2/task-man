import { useMemo } from 'react';
import type { Task } from '../../types.js';

export interface CategoryInfo {
  name: string;
  count: number;
}

export interface CategoryMatchResult {
  /** The `-c` token partial currently being typed (empty string if none). */
  partial: string;
  /** Is the input currently inside a `-c` token? (i.e. ghost/list are relevant) */
  active: boolean;
  /** Completion to append after the partial (ghost text). Null if no prefix match or partial is exact. */
  ghost: string | null;
  /** Full canonical name of top prefix match (used when accepting ghost). */
  topMatch: string | null;
  /** Short list of candidate categories (top first) — includes the top match. */
  list: string[];
  /** Near-miss suggestion: partial is not a prefix of any category but is within Levenshtein 2. */
  didYouMean: string | null;
}

/** Build a ranked list of categories with task counts. */
export function getAllCategories(tasks: Task[]): CategoryInfo[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    for (const c of t.categories ?? []) {
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Iterative Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Prefix match ranked by task-count desc. */
export function suggestPrefix(
  partial: string,
  cats: CategoryInfo[],
): { top: CategoryInfo | null; list: CategoryInfo[] } {
  if (!partial) return { top: null, list: [] };
  const p = partial.toLowerCase();
  const matches = cats.filter(c => c.name.toLowerCase().startsWith(p));
  return { top: matches[0] ?? null, list: matches };
}

/** Fuzzy fallback: closest category by Levenshtein ≤ 2 that is NOT a prefix match. */
export function suggestFuzzy(
  partial: string,
  cats: CategoryInfo[],
): CategoryInfo | null {
  if (!partial || partial.length < 2) return null;
  const p = partial.toLowerCase();
  let best: { cat: CategoryInfo; dist: number } | null = null;
  for (const c of cats) {
    const n = c.name.toLowerCase();
    if (n.startsWith(p)) return null;
    const dist = levenshtein(p, n);
    if (dist <= 2 && (!best || dist < best.dist || (dist === best.dist && c.count > best.cat.count))) {
      best = { cat: c, dist };
    }
  }
  return best?.cat ?? null;
}

/**
 * Parse a `-c <partial>` token from the current input text.
 * Returns the active partial, or null if the cursor isn't inside a `-c` token.
 *
 * A `-c` token is "active" if:
 *   - `-c` appears in the input
 *   - the next whitespace-delimited token is being typed (we look only at the
 *     last `-c` occurrence and its immediately-following token)
 *
 * We consider the input up to end-of-string; the partial is the token after the
 * last `-c ` that has not been terminated by a trailing space.
 */
export function parseCategoryPartial(input: string): string | null {
  // Quoted partial first: -c "foo bar
  const reQuoted = /(^|\s)-c\s+"([^"]*)$/;
  const mq = input.match(reQuoted);
  if (mq) return mq[2];
  // Unquoted whitespace-delimited partial: -c foo
  const re = /(^|\s)-c\s+([^\s]*)$/;
  const m = input.match(re);
  if (!m) return null;
  return m[2];
}

/** Hook: given raw input text + tasks, produce autocomplete / fuzzy suggestion state. */
export function useCategoryMatch(inputText: string, tasks: Task[]): CategoryMatchResult {
  const cats = useMemo(() => getAllCategories(tasks), [tasks]);

  return useMemo(() => {
    const partial = parseCategoryPartial(inputText);
    if (partial === null) {
      return {
        partial: '',
        active: false,
        ghost: null,
        topMatch: null,
        list: [],
        didYouMean: null,
      };
    }

    const { top, list } = suggestPrefix(partial, cats);

    if (top) {
      // Ghost is the remaining characters of the canonical name (case-preserving).
      const ghost = top.name.length > partial.length ? top.name.slice(partial.length) : null;
      return {
        partial,
        active: true,
        ghost,
        topMatch: top.name,
        list: list.map(c => c.name),
        didYouMean: null,
      };
    }

    const fuzzy = suggestFuzzy(partial, cats);
    return {
      partial,
      active: true,
      ghost: null,
      topMatch: null,
      list: [],
      didYouMean: fuzzy?.name ?? null,
    };
  }, [inputText, cats]);
}
