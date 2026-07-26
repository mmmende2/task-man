import type { Task } from './types.js';

// Single source of truth for Refine: one ordered list of "aspects" from which
// BOTH the queue (which tasks need refining) and the cards (what to ask) are
// derived. Adding a refinable thing = adding one ASPECTS entry; the queue and
// the questions can't drift because they read the same list. Pure — imports
// only ./types.js, so refine-queue.ts and refine-questions.ts can both depend
// on it without a cycle.
//
// One entry per TRIGGER, not per question: two entries may share a `reason`
// when they raise the same card from different conditions (priority_review
// does). missingAspects dedupes by reason so the human is asked once.

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
 * A todo that has sat UNTOUCHED for a month warrants a priority re-check.
 * Already-high tasks are exempt (their urgency is answered). NOT AI-specific —
 * fires for any origin, and is the only non-Claude trigger for the priority card.
 *
 * Measured from `updated_at`, NOT `created_at`. created_at is immutable, so a
 * created_at-based check has no termination condition: answering the card wrote
 * a priority, the task was instantly stale again, and refine re-asked the same
 * question every session forever. Answering bumps updated_at, which buys the
 * nudge another STALE_TODO_DAYS of quiet. Skipping the card writes nothing, so
 * a skipped task correctly stays stale and is offered again next session.
 */
export function isStaleTodo(t: Task): boolean {
  return t.status === 'todo' && daysSince(t.updated_at) > STALE_TODO_DAYS && t.priority !== 'high';
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

/** The priority card, shared by the two aspects that can raise it (the
    glance-once Claude review and the stale-todo nudge) — same prompt, same
    options, same field written, so they share the `priority_review` key. */
function priorityCard(): QuestionDef {
  return {
    reason: 'priority_review',
    type: 'list',
    prompt: 'How urgent is this, really?',
    options: [
      { label: 'high', value: 'high' },
      { label: 'medium', value: 'medium' },
      { label: 'low', value: 'low' },
    ],
  };
}

export interface RefineAspect {
  reason: RefineReason;
  /**
   * `gap` = information not yet captured (drives "refined").
   * `review` = a human sanity-check of a value Claude set.
   * `ride_along` = offered when a task is already queued, but never admits a
   * task to the queue on its own (title fix, stale-priority nudge,
   * delete-suspicious, focus nudge).
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
 * The refinable aspects, IN ASK ORDER: quick title fix, the core gaps (time,
 * vibe), then the Claude reviews (scope, priority), then the category gap, the
 * stale-priority nudge, the "does it belong?" escape hatch, and finally the
 * focus nomination.
 *
 * The Claude reviews sit ABOVE the category gap deliberately: they're
 * glance-once, so if the 3-card cap bumped them they'd never be re-offered —
 * putting them ahead of the lower-value category gap lets the scope review
 * surface on a brand-new Claude task, and the category question rides a later
 * pass instead. The ride-alongs sit BELOW it for the mirror reason: they recur,
 * so losing one to the cap costs nothing.
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
    missing: (t) => needsClaudeReview(t),
    buildCard: () => priorityCard(),
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
    // Same card as the Claude priority review above, different trigger — and
    // deliberately a RIDE-ALONG, not a review. Staleness is a recurring
    // condition, not a gap in the metadata refine exists to capture, so it must
    // never drag a fully-refined task into the queue on its own; it only rides
    // a task queued for a real gap. It sits below the gaps for the same reason:
    // if the 3-card cap has to drop something, drop the nudge, not the gap.
    reason: 'priority_review',
    kind: 'ride_along',
    scope: 'all',
    missing: (t) => isStaleTodo(t),
    buildCard: () => priorityCard(),
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

/**
 * The aspects whose info a task still lacks, in ask order.
 *
 * Deduped by `reason`, first match wins: two aspects may share a routing key
 * when they raise the SAME card from different triggers (priority_review does —
 * the Claude review and the stale nudge), and the human should be asked once,
 * not twice. First-wins matters: the review entry sits earlier in ASPECTS, so a
 * task that is both brand-new-from-Claude and stale keeps the `review` kind and
 * stays queue-admitting.
 */
export function missingAspects(task: Task, ctx: AspectContext): RefineAspect[] {
  const seen = new Set<RefineReason>();
  return ASPECTS.filter((a) => {
    if (!a.missing(task, ctx) || seen.has(a.reason)) return false;
    seen.add(a.reason);
    return true;
  });
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
