import type { Task, TaskScope } from './types.js';
import { filterByScope } from './task-filters.js';

// The "question brain" for Refine, extracted from the TUI so the web can
// drive the exact same card sequence. Pure — no React, no I/O — and
// unit-tested directly (see __tests__/refine-questions.test.ts).

/**
 * The category names to offer during refine, derived identically by the TUI
 * and the web so the two never drift.
 *
 * - **Scoped**: only categories used within `scope` (undefined = all). Without
 *   this, professional categories (e.g. a work ticket) leak into a personal
 *   refine session and vice-versa. Uses parent-scope semantics (filterByScope).
 * - **Case-deduped**: `aim` and `AIM` collapse to one entry — the casing that
 *   appears most often wins (ties → the lexicographically smaller casing).
 * - **Usage-ordered**: most-used first, so the quick-pick buttons
 *   (knownCategories.slice(0, 5) in buildQuestions) surface the common ones and
 *   the long tail lives in the web's full dropdown.
 */
export function deriveCategories(tasks: Task[], scope?: TaskScope): string[] {
  const scoped = filterByScope(tasks, scope);
  const byKey = new Map<string, { count: number; casings: Map<string, number> }>();
  for (const t of scoped) {
    for (const c of t.categories) {
      const entry = byKey.get(c.toLowerCase()) ?? { count: 0, casings: new Map() };
      entry.count += 1;
      entry.casings.set(c, (entry.casings.get(c) ?? 0) + 1);
      byKey.set(c.toLowerCase(), entry);
    }
  }
  return [...byKey.values()]
    .map((e) => {
      let name = '';
      let best = -1;
      for (const [casing, n] of e.casings) {
        if (n > best || (n === best && casing < name)) {
          name = casing;
          best = n;
        }
      }
      return { name, count: e.count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((c) => c.name);
}

export type QuestionType = 'yesno' | 'list' | 'number' | 'correction' | 'confirm';

export interface QuestionOption {
  label: string;
  value: string;
}

export interface QuestionDef {
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  original?: string;
  suggestion?: string;
  /** Advisory line shown under the prompt (never blocks). Used by the focus
      card when the warning threshold is reached. */
  note?: string;
}

export const MAX_QUESTIONS_PER_TASK = 3;

export const COMMON_TYPOS: [RegExp, string][] = [
  [/\bteh\b/gi, 'the'],
  [/\brecieve\b/gi, 'receive'],
  [/\bUdpate\b/g, 'Update'],
  [/\budpate\b/g, 'update'],
  [/\badress\b/gi, 'address'],
  [/\bfreind\b/gi, 'friend'],
  [/\bocurr/gi, 'occurr'],
  [/\bseperate\b/gi, 'separate'],
  [/\bdefinately\b/gi, 'definitely'],
];

export function suggestTitleFix(title: string): string | null {
  let fixed = title;

  // Trailing/leading space
  const trimmed = fixed.trim();
  if (trimmed !== fixed) fixed = trimmed;

  // All-caps (longer than one word)
  if (fixed.length > 3 && fixed === fixed.toUpperCase() && /[A-Z]/.test(fixed)) {
    fixed = fixed.charAt(0) + fixed.slice(1).toLowerCase();
  }

  // Common transpositions
  for (const [pattern, replacement] of COMMON_TYPOS) {
    fixed = fixed.replace(pattern, replacement);
  }

  return fixed !== title ? fixed : null;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Build the ordered question list for one task, capped at
 * MAX_QUESTIONS_PER_TASK.
 *
 * `focusWarnThreshold` is a *soft* advisory number, not a cap: the focus
 * card is always offered for unfocused tasks, and when the current focused
 * count has reached the threshold the card gains a warning note ("already N
 * focused — add anyway?"). Pass `null` to offer the card with no warning
 * (the web does this — it has no local config).
 *
 * `suppressFocusQuestion` omits the focus card entirely. The "ask at most 2
 * focus questions per refine session" cap is caller-enforced (the pure
 * function has no session state) — the caller passes true once its budget is
 * spent.
 */
export function buildQuestions(
  task: Task,
  allTasks: Task[],
  focusedCount: number,
  focusWarnThreshold: number | null,
  knownCategories: string[],
  suppressFocusQuestion = false,
): QuestionDef[] {
  const list: QuestionDef[] = [];

  // 1. Spelling/title correction
  const suggestion = suggestTitleFix(task.title);
  if (suggestion) {
    list.push({
      type: 'correction',
      prompt: 'Quick fix — does this look right?',
      original: task.title,
      suggestion,
    });
  }

  // 2. Scope check. `scope` is never null in practice (TaskStore defaults it
  // to 'personal'), so the old `!task.scope` condition made this card
  // unreachable. Instead, ask on unrefined Claude-created tasks: Claude
  // rarely sets scope deliberately, and "no time_estimate + no vibe yet"
  // is the proxy for "first refine pass" — once refined, this stops firing.
  const unrefinedClaudeTask =
    task.created_by === 'claude' && task.time_estimate == null && task.vibe == null;
  if (!task.scope || unrefinedClaudeTask) {
    list.push({
      type: 'number',
      prompt: 'Work thing or personal thing?',
      options: [
        { label: 'personal', value: 'personal' },
        { label: 'professional', value: 'professional' },
        { label: 'skip', value: '__skip' },
      ],
    });
  }

  // 2b. Missing time estimate
  if (task.time_estimate == null) {
    list.push({
      type: 'number',
      prompt: 'How long will this take?',
      options: [
        { label: '<5m', value: '<5m' },
        { label: '20m', value: '20m' },
        { label: '45m', value: '45m' },
        { label: '>1h', value: '>1h' },
        { label: '>3h', value: '>3h' },
      ],
    });
  }

  // 2c. Missing vibe
  if (task.vibe == null) {
    list.push({
      type: 'number',
      prompt: 'Vibe check?',
      options: [
        { label: 'love', value: 'love' },
        { label: 'ok', value: 'ok' },
        { label: 'dread', value: 'dread' },
      ],
    });
  }

  // 3. Priority review
  const stale = task.status === 'todo' && daysSince(task.created_at) > 7 && task.priority !== 'high';
  if (task.created_by === 'claude' || stale) {
    list.push({
      type: 'list',
      prompt: 'How urgent is this, really?',
      options: [
        { label: 'high', value: 'high' },
        { label: 'medium', value: 'medium' },
        { label: 'low', value: 'low' },
      ],
    });
  }

  // 4. Focus nomination. There is no focus *limit* — the card is always
  // offered for unfocused tasks. When the soft threshold is reached it only
  // warns (see focusWarnThreshold above); it never suppresses the card.
  if (!task.focused && !suppressFocusQuestion) {
    const overThreshold = focusWarnThreshold != null && focusedCount >= focusWarnThreshold;
    list.push({
      type: 'yesno',
      prompt: 'Pull this into tomorrow\'s focus?',
      ...(overThreshold ? { note: `already ${focusedCount} focused — add anyway?` } : {}),
    });
  }

  // 5. AI task review — skip if user has already set any metadata on this task,
  // or if it has subtasks (a parent with children is clearly relevant).
  // NOTE: scope is deliberately absent here — it defaults to 'personal' on
  // every task, so `scope != null` was always true and made this check
  // (and the "does it belong?" card below) permanently dead.
  const hasEngagement =
    task.time_estimate != null ||
    task.vibe != null ||
    task.categories.length > 0 ||
    task.focused ||
    allTasks.some(t => t.parent_id === task.id);

  if (task.created_by === 'claude' && !task.description && !hasEngagement) {
    list.push({
      type: 'confirm',
      prompt: 'Claude added this — does it belong?',
    });
  }

  // 6. Category assignment
  if (task.categories.length === 0 && knownCategories.length > 0) {
    const options = knownCategories.slice(0, 5).map(c => ({ label: c, value: c }));
    options.push({ label: 'skip', value: '__skip' });
    list.push({
      type: 'number',
      prompt: 'File this under...?',
      options,
    });
  }

  return list.slice(0, MAX_QUESTIONS_PER_TASK);
}
