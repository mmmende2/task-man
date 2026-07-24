import type { Task } from './types.js';

// Single source of truth for Refine: one ordered list of "aspects" from which
// BOTH the queue (which tasks need refining) and the cards (what to ask) are
// derived. Adding a refinable thing = adding one ASPECTS entry; the queue and
// the questions can't drift because they read the same list. Pure — imports
// only ./types.js, so refine-queue.ts and refine-questions.ts can both depend
// on it without a cycle.

export type RefineReason =
  | 'title_fix'
  | 'no_time_estimate'
  | 'no_vibe'
  | 'no_category'
  | 'scope_review'
  | 'priority_review'
  | 'belongs'
  | 'focus';

export type QuestionType = 'yesno' | 'list' | 'number' | 'correction' | 'confirm';

export interface QuestionOption {
  label: string;
  value: string;
}

export interface QuestionDef {
  /** Stable routing key — the field/aspect this card fills. Consumers switch on
      this, never on the prompt text. */
  reason: RefineReason;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  original?: string;
  suggestion?: string;
  /** Advisory line under the prompt (never blocks) — used by the focus card. */
  note?: string;
}

export const MAX_QUESTIONS_PER_TASK = 3;

/** Days a todo can sit untouched before refine flags it as stale. */
export const STALE_TODO_DAYS = 30;

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

/**
 * A stale todo warrants a priority re-check. Already-high tasks are exempt
 * (their urgency is answered). NOT AI-specific — fires for any origin, and is
 * the only non-Claude trigger for the priority card.
 */
export function isStaleTodo(t: Task): boolean {
  return t.status === 'todo' && daysSince(t.created_at) > STALE_TODO_DAYS && t.priority !== 'high';
}

/**
 * Should the human sanity-check the scope/priority Claude GUESSED on a task it
 * created? Strictly Claude-only, and only while the task is brand-new (no time
 * estimate or vibe yet). The moment you engage the task these one-time reviews
 * stop and never return: scope and priority always carry a default value, so
 * there is no "already answered" signal to detect — this "glance once on a
 * fresh task" gate is the deliberate substitute (no stored flag).
 */
export function needsClaudeReview(t: Task): boolean {
  return t.created_by === 'claude' && t.time_estimate == null && t.vibe == null;
}

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
  const trimmed = fixed.trim();
  if (trimmed !== fixed) fixed = trimmed;
  if (fixed.length > 3 && fixed === fixed.toUpperCase() && /[A-Z]/.test(fixed)) {
    fixed = fixed.charAt(0) + fixed.slice(1).toLowerCase();
  }
  for (const [pattern, replacement] of COMMON_TYPOS) {
    fixed = fixed.replace(pattern, replacement);
  }
  return fixed !== title ? fixed : null;
}

export type AspectKind = 'gap' | 'review' | 'ride_along';

export interface AspectContext {
  anyCategoriesExist: boolean;
  knownCategories: string[];
  focusedCount: number;
  focusWarnThreshold: number | null;
  suppressFocus: boolean;
  /** Does this task have subtasks? Part of the 'belongs' engagement check. */
  hasSubtasks: boolean;
}

export interface RefineAspect {
  reason: RefineReason;
  /**
   * `gap` = information not yet captured (drives "refined").
   * `review` = a human sanity-check of a value Claude set.
   * `ride_along` = offered when a task is already queued, but never admits a
   * task to the queue on its own (title fix, delete-suspicious, focus nudge).
   */
  kind: AspectKind;
  /** Descriptive: which tasks this concerns. `missing()` is authoritative. */
  scope: 'all' | 'claude';
  missing(task: Task, ctx: AspectContext): boolean;
  buildCard(task: Task, ctx: AspectContext): QuestionDef;
}

/** A Claude task is engaged enough that "does it belong?" no longer applies. */
function hasEngagement(task: Task, ctx: AspectContext): boolean {
  return (
    task.time_estimate != null ||
    task.vibe != null ||
    task.categories.length > 0 ||
    task.focused ||
    ctx.hasSubtasks
  );
}

/**
 * The refinable aspects, IN ASK ORDER: quick title fix, then the gaps
 * (information not yet captured), then the Claude reviews, then the
 * "does it belong?" escape hatch, then the focus nomination.
 */
export const ASPECTS: readonly RefineAspect[] = [
  {
    reason: 'title_fix',
    kind: 'ride_along',
    scope: 'all',
    missing: (t) => suggestTitleFix(t.title) !== null,
    buildCard: (t) => ({
      reason: 'title_fix',
      type: 'correction',
      prompt: 'Quick fix — does this look right?',
      original: t.title,
      suggestion: suggestTitleFix(t.title) ?? t.title,
    }),
  },
  {
    reason: 'no_time_estimate',
    kind: 'gap',
    scope: 'all',
    missing: (t) => t.time_estimate == null,
    buildCard: () => ({
      reason: 'no_time_estimate',
      type: 'number',
      prompt: 'How long will this take?',
      options: [
        { label: '<5m', value: '<5m' },
        { label: '20m', value: '20m' },
        { label: '45m', value: '45m' },
        { label: '>1h', value: '>1h' },
        { label: '>3h', value: '>3h' },
      ],
    }),
  },
  {
    reason: 'no_vibe',
    kind: 'gap',
    scope: 'all',
    missing: (t) => t.vibe == null,
    buildCard: () => ({
      reason: 'no_vibe',
      type: 'number',
      prompt: 'Vibe check?',
      options: [
        { label: 'love', value: 'love' },
        { label: 'ok', value: 'ok' },
        { label: 'dread', value: 'dread' },
      ],
    }),
  },
  {
    reason: 'no_category',
    kind: 'gap',
    scope: 'all',
    missing: (t, ctx) => t.categories.length === 0 && ctx.anyCategoriesExist,
    buildCard: (_t, ctx) => ({
      reason: 'no_category',
      type: 'number',
      prompt: 'File this under...?',
      options: [
        ...ctx.knownCategories.slice(0, 5).map((c) => ({ label: c, value: c })),
        { label: 'skip', value: '__skip' },
      ],
    }),
  },
  {
    reason: 'scope_review',
    kind: 'review',
    scope: 'claude',
    missing: (t) => needsClaudeReview(t),
    buildCard: () => ({
      reason: 'scope_review',
      type: 'number',
      prompt: 'Work thing or personal thing?',
      options: [
        { label: 'personal', value: 'personal' },
        { label: 'professional', value: 'professional' },
        { label: 'skip', value: '__skip' },
      ],
    }),
  },
  {
    reason: 'priority_review',
    kind: 'review',
    scope: 'claude',
    missing: (t) => needsClaudeReview(t) || isStaleTodo(t),
    buildCard: () => ({
      reason: 'priority_review',
      type: 'list',
      prompt: 'How urgent is this, really?',
      options: [
        { label: 'high', value: 'high' },
        { label: 'medium', value: 'medium' },
        { label: 'low', value: 'low' },
      ],
    }),
  },
  {
    reason: 'belongs',
    kind: 'ride_along',
    scope: 'claude',
    missing: (t, ctx) => t.created_by === 'claude' && !t.description && !hasEngagement(t, ctx),
    buildCard: () => ({
      reason: 'belongs',
      type: 'confirm',
      prompt: 'Claude added this — does it belong?',
    }),
  },
  {
    reason: 'focus',
    kind: 'ride_along',
    scope: 'all',
    missing: (t, ctx) => !t.focused && !ctx.suppressFocus,
    buildCard: (_t, ctx) => {
      const overThreshold =
        ctx.focusWarnThreshold != null && ctx.focusedCount >= ctx.focusWarnThreshold;
      return {
        reason: 'focus',
        type: 'yesno',
        prompt: "Pull this into tomorrow's focus?",
        ...(overThreshold ? { note: `already ${ctx.focusedCount} focused — add anyway?` } : {}),
      };
    },
  },
];

/**
 * Build a context whose card-only fields are inert — safe for the candidacy /
 * refined checks, which read only task fields + `anyCategoriesExist`.
 */
export function baseCtx(anyCategoriesExist: boolean): AspectContext {
  return {
    anyCategoriesExist,
    knownCategories: [],
    focusedCount: 0,
    focusWarnThreshold: null,
    suppressFocus: false,
    hasSubtasks: false,
  };
}

/** The aspects whose info a task still lacks, in ask order. */
export function missingAspects(task: Task, ctx: AspectContext): RefineAspect[] {
  return ASPECTS.filter((a) => a.missing(task, ctx));
}

/**
 * A task is "refined" once every GAP is filled (time + vibe, and category when
 * some category exists). Title fixes, Claude reviews, and focus don't count.
 * This is the queue/badge benchmark — NOT the review gate (see needsClaudeReview).
 */
export function isRefined(task: Task, opts: { anyCategoriesExist: boolean }): boolean {
  const ctx = baseCtx(opts.anyCategoriesExist);
  return !ASPECTS.some((a) => a.kind === 'gap' && a.missing(task, ctx));
}
