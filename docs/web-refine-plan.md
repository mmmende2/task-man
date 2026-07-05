# Web Refine Plan — the card-flip triage, on the phone

Status: **shipped** (2026-07-05). All five steps landed: the question brain
is extracted to `cli/src/refine-questions.ts` (`task-man/refine-questions`,
unit-tested), the focus card is offered with no hard cap, `web/src/api.ts`
gained `deleteTask`, `web/src/pages/Refine.tsx` drives the card loop, and the
NavMenu/route + docs are wired. Companion TUI fix (footers never advertised
`r:refine`) shipped earlier. The NavMenu `Refine (N)` count badge landed
2026-07-05 (scoped, computed on menu-open). Still deferred: TUI `~`-scope
parity in Refine.

## Why this fits the web

Refine is the most phone-shaped mode task-man has: one question at a time,
single-tap answers, no keyboard needed, and it thrives in exactly the "gaps"
moments (couch, line at the store) where the phone is the device at hand.
The PRD's Refine loop — Scope? Priority? How long? Vibe? Focus? — maps 1:1
onto big tap targets.

## The one real refactor: extract the question brain

The queue logic is already shared and pure (`buildRefineQueue` in
`cli/src/refine-queue.ts`, exported). But the *question* logic is not:
`buildQuestions()`, `suggestTitleFix()`, `COMMON_TYPOS`, and
`MAX_QUESTIONS_PER_TASK` live inside `RefineMode.tsx` (a TUI component), and
the `QuestionDef` type lives in `RefineQuestion.tsx`. If the web reimplements
them, the two surfaces drift on the first tweak.

**Step 1 is therefore**: move all of that into a new pure module
`cli/src/refine-questions.ts`, export it via the package `exports` map
(`task-man/refine-questions`), point the TUI at it (zero behavior change),
and unit-test it directly for the first time (question selection per task
shape, the 3-question cap, typo fixes).

## Web page design

**Route**: `/refine`, entry in `NavMenu`.

**Data flow** (mirrors the TUI exactly):

- On entry, fetch the task list **once** (`api.listTasks()`), build the
  queue client-side with `buildRefineQueue`, and snapshot it. No polling
  mid-session — cards must not reshuffle under your thumb. Known categories
  for the "File this under…?" card derive from the same snapshot.
- Answers apply through `api.patchTask(id, {...})`; the "Claude added this —
  does it belong?" card's *trash* action needs a `api.deleteTask(id)` method
  added to `web/src/api.ts` (the `DELETE /api/tasks/:id` route already
  exists).
- **Undo = one step**, like the TUI: capture the previous field values
  before each patch, `u`-equivalent button restores them.
- A patch that 404s (task deleted elsewhere mid-session) → toast + auto-skip
  that task, don't break the run.

**Card UI** (reusing Capture's design vocabulary — Segmented buttons, pills,
the accent-border card):

- Header: progress — `task 3 / 9 · question 1 / 3`, task title + its current
  meta as dim chips (priority dot, categories, per/pro).
- Body per question type:
  - `number`/`list` (scope, time, vibe, priority, category) → one big
    button per option, tap = answer + advance with a brief flash.
  - `yesno` (pull into focus) → two buttons.
  - `confirm` (does it belong?) → Keep / Trash (+ Edit title).
  - `correction` (typo fix) → original vs suggestion side by side,
    Accept / Keep / Edit (inline input).
- Footer bar: **Skip question · Skip task · Undo**.
- Completion state: `N tasks reviewed. Clean slate.` with a link back to
  Focus. Empty-queue state on entry: `Nothing needs refine.`

**Scope**: the page respects the shared scope chip (sessionStorage-synced
with Focus/Backlog/Metrics) by filtering queue *candidates* through
`matchesScope` before building. Note: the TUI's Refine currently ignores
`~` — TUI parity is a cheap follow-up once this decision proves out.

## Decided: no focus limit (Mario, 2026-07-04)

`focus.maxFocused` is a *soft* guardrail everywhere it exists — Plan mode's
Space prompt warns and lets you proceed; nothing blocks. But the TUI's
`buildQuestions` currently **suppresses** the "pull into focus?" card
entirely once the cap is reached — a silent hard limit that contradicts the
product rule. So:

- The focus-nomination card is **always offered** for unfocused tasks, on
  both surfaces. At/over the cap it becomes advisory copy in the card
  itself ("already 3 focused — add anyway?"), same spirit as Plan's prompt.
- This deletes the config problem entirely: the web needs no `/api/config`,
  no hardcoded cap, and `buildQuestions` drops its `maxFocused` gate
  (keeping `focusedCount` only for the advisory copy).
- The TUI behavior change (card no longer suppressed at cap) lands with the
  step-1 extraction, deliberately.

Shipped 2026-07-05: the **Refine count badge in NavMenu** (`Refine (7)`) —
NavMenu fetches the task list once on menu-open, scopes it to the active
scope chip, and shows `buildRefineQueue(...).length` as a quiet accent pill.

## Steps

1. Extract `cli/src/refine-questions.ts` (+ `QuestionDef`), re-point TUI,
   add exports-map entry, unit tests. **One deliberate behavior change**:
   the focus card is no longer suppressed at the cap (see above) — it gains
   advisory copy instead. Ships alone.
2. `web/src/api.ts`: add `deleteTask`.
3. `web/src/pages/Refine.tsx` + CSS: snapshot/queue state machine, the five
   card renderers, apply/undo/skip plumbing, flash + completion states.
4. `NavMenu` entry + route in `App.tsx`.
5. Docs: web README page list, PRD web-scope line ("Plan stays TUI-only" —
   Refine moves out of that sentence), system-map surfaces row.

Sizing: step 1 is small and mechanical; step 3 is the bulk (one focused
session). Steps run in order; 1 can merge independently.

## Explicitly out (v1)

- AI-assisted refine (auto-suggested categories/priorities) — that's the
  MCP `task_refine_queue` / future sweep territory, not this page.
- Reordering or batching answers — one card at a time is the point.
- TUI `~`-scope parity in Refine (follow-up decision, see above).
