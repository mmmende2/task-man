# Recurrence + Due Dates Plan — externalize time

Status: **proposed, not started**. Independent of the authorization plan; can land
before or after (no shared files beyond `types.ts`, and validation schemas — merge
order is trivial either way).

## Why

The PRD names time blindness as a design target, yet the tool has no time
features. Every routine chore is re-entered by hand or forgotten; nothing can
express "this matters Friday." This is the highest-leverage product gap
(see `critical-review-2026-07.md` §1).

## Design principles (from the PRD)

- **No alarms, no red badges, no streak panic.** Due-ness is surfaced quietly,
  in the places you already look — never as a notification.
- **Materialized instances, not virtual occurrences.** Completing a recurring
  task creates the next real task row. Dumb, diffable, debuggable — and metrics/
  insights keep working with zero changes because history is just tasks.
- **Date-only, local.** `due` is a `YYYY-MM-DD` string interpreted in local time
  via the existing `local-date.ts` helpers. No timestamps, no timezone math, no
  DST edge cases (we've been burned twice already — see the date-bug commit).

## Data model

```ts
// types.ts — Task gains:
due?: string | null;                  // "YYYY-MM-DD", local calendar date
recur?: {
  every: 'day' | 'week' | 'month';
  interval?: number;                  // default 1 — e.g. every 2 weeks
} | null;
```

Rules:
- `recur` without `due` is invalid (the anchor is the due date). Validation
  rejects it; the Refine card asks for a due date first.
- Advancing: next `due` = current `due` + interval (month arithmetic clamps to
  month end: Jan 31 + 1 month → Feb 28). Advance from the *scheduled* date, not
  the completion date, so a chore done late doesn't drift — but if the computed
  next `due` is still in the past (task completed very late), fast-forward to
  the first occurrence ≥ today. Both behaviors in one rule: schedule-anchored,
  never spawns already-overdue work.
- Subtasks can have `due` but not `recur` (recurring subtasks under a
  non-recurring parent is a modeling swamp; revisit only with a real use case).

## Spawn-on-completion — where it lives

**In `TaskStore.update()`**, on the `→ done` transition of a task with `recur`:

1. Mark the instance done as usual (it keeps its `due` for history).
2. Clear `recur` on the completed instance and create the next instance in the
   same locked write: same title/description/scope/categories/priority/
   time_estimate/vibe/owner, fresh id, `status: todo`, `focused: false`,
   advanced `due`, carrying the `recur` rule forward. `created_by` copies from
   the completed instance (a chain Claude created stays attributed to Claude).

Why the store and not the handlers: the TUI calls `store.update()` directly, so
handler-level spawning would miss the primary surface. And because remote mode's
`/api/store/update` executes `TaskStore.update()` on the server, one
implementation covers TUI local, TUI remote, MCP, and web identically.

Known edge (accepted): toggling a completed recurring task back to todo (`x` on
a done task, or undo) does not retract the spawned next instance — you'd briefly
have two open occurrences; complete or delete one. Guarding this means tracking
spawn lineage; not worth it in v1.

## Surfacing (quiet, per mode)

| Surface | Change |
|---|---|
| Focus / Plan rows | A dim `↻` glyph for recurring; due-today gets the date rendered in cyan, overdue in magenta — the row itself, not a badge. Sorted position unchanged (no auto-bumping). |
| Write capture | `-D <date>` flag: `-D 2026-07-10`, `-D today`, `-D tomorrow`, `-D fri` (next such weekday). Parsed in `parse-entry.ts` alongside existing flags. Recurrence is *not* capturable inline in v1 — it's a Refine/MCP concern. |
| Refine mode | New card question "Due date?" (skippable, like all cards) for tasks without one; "Repeat?" (day/week/month/no) asked only when a due date exists. |
| Metrics / end-day report | One line: `Due tomorrow: N` + titles (capped 3). Overdue count appears only in Plan mode — the report stays retrospective and shame-free. |
| MCP | `task_add`/`task_update` accept `due` + `recur`; `task_list` gains `due: 'today' \| 'overdue' \| 'week'` filter; refine-queue reasons gain `overdue`. |
| Non-interactive CLI | `task-man add --due <date>`; `task-man list --due today\|overdue\|week`. |

## Steps

1. `types.ts` + validation (zod schema if the authz plan's schemas landed;
   otherwise local checks in `TaskStore.add/update`).
2. `local-date.ts`: `addInterval(date, every, interval)` + `nextWeekday()` —
   pure, heavily unit-tested (month-end clamp, fast-forward rule).
3. `TaskStore.update()` spawn logic + tests (spawn fields, same-lock atomicity,
   fast-forward, no spawn on already-done → done no-op).
4. `parse-entry.ts` `-D` flag + tests.
5. `task-filters.ts`: `dueOn/overdue/dueWithin` pure helpers (shared by TUI,
   MCP, CLI list, refine-queue).
6. TUI: row glyphs (Focus/Plan), Refine cards, Metrics/end-day line.
7. MCP + CLI flags.
8. Docs: PRD roadmap (moves out of Phase 6), cli/mcp READMEs, system-map.

Sizing: 2 is the correctness-critical core (small but test-heavy); 3 and 6 are
the bulk. Two focused sessions, TUI polish being the long tail.

## Explicitly deferred

- Reminders/notifications of any kind
- Cron-style rules (`every: 'weekday'`, "first Monday") — the three units cover
  chores; complex schedules wait for a real need
- Recurring subtasks
- Retracting spawned instances on un-complete
