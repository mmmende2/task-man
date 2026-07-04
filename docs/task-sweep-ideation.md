# Task Sweep — ideation for metadata-driven cleanup

Status: **ideation** (per Mario's ask, 2026-07): a feature for cleaning up tasks
via code and/or AI over MCP, based on metadata. This explores the space and
recommends a v1; it is not yet an execution plan.

## The mess being cleaned

Three distinct kinds of cruft accumulate, and they want different treatment:

1. **Completed history** — done tasks pile up forever in `tasks.json`. Not
   *wrong* (metrics feed on them) but unbounded, and one day it's megabytes per
   remote poll.
2. **Rotting backlog** — todos that stopped being real: stale (>30d untouched),
   duplicates from fast capture, Claude-created tasks nobody adopted, dead
   subtasks under long-done parents.
3. **Integrity debris** — dangling `parent_id`s (MCP delete leaves orphans by
   design), tasks with impossible field combos from the unvalidated-API era.

## Principle: three verbs, escalating reversibility

| Verb | What happens | Reversible? |
|---|---|---|
| **archive** | Move to `~/.task-man/archive.json` (or archived flag) — out of every view and poll, still available to metrics lookback | Fully (unarchive) |
| **trash** | Soft delete: `deleted_at` set, hidden everywhere, purged after 30 days | For 30 days |
| **repair** | Fix integrity in place (null a dangling parent, normalize a bad enum) | Via trash of the pre-image? No — just log it |

Soft delete (`deleted_at`) is the load-bearing prerequisite: it retrofits an
undo net under *every* destructive surface (TUI `dd`, web delete, MCP
`task_delete`), fixing the "one bad model call permanently orphans a tree"
problem from the review — worth building even if sweep never ships.

## The split: code judges facts, AI judges meaning

**Deterministic rules (code)** — cheap, safe, no judgment required:

| Rule | Verb | Metadata used |
|---|---|---|
| `done` and `completed_at` > N days (default 90) | archive | status, completed_at |
| Subtask whose parent is archived | archive with parent | parent_id |
| Dangling `parent_id` | repair (promote to top-level, note it) | parent_id |
| Trash older than 30 days | purge | deleted_at |

**Judgment calls (AI via MCP)** — where metadata alone can't decide:

| Candidate signal | Why AI | Example judgment |
|---|---|---|
| `todo`, untouched > 30d, unfocused, low priority | Is it obsolete or just dormant? | "Water plants" is dormant; "Prep for March demo" is dead in July |
| `created_by: claude`, never human-touched, > 14d | Did the human ever adopt this? | Cross-reference: was the session's work merged? |
| Near-duplicate titles (case/whitespace/typo distance) | Merge, or genuinely distinct? | "fix auth bug" vs "Fix auth token bug" |
| Task references code/repo state | Claude can *check* | "Migrate to vite 8" — package.json says already done → propose trash |

That last row is the differentiating idea: Claude Code can verify a task's
claim against the actual repo (git log, package.json, file existence) before
proposing cleanup. No conventional task manager can do that.

## Contract: propose → approve, never auto-apply

Same as `task_prioritize`. A `task_sweep` MCP tool returns candidates with
machine reasons (`stale_todo`, `dup_of:<id>`, `parent_archived`, …); Claude
investigates, then presents a batched proposal; accepted items are applied via
existing `task_update`/`task_delete` calls (which now soft-delete). The
deterministic rules can run unattended precisely because their verbs are
reversible; anything AI-judged goes through the human.

## Surfaces considered

- **`task-man sweep`** (CLI): dry-run by default, `--apply` for the
  deterministic set. The unattended entry point (could even run in the droplet's
  nightly cron next to backups).
- **MCP `task_sweep`**: the AI entry point, as above.
- **Refine mode**: fold judgment candidates in as a new card type ("Still
  relevant? keep / trash / archive"). Attractive because the card-flip UX and
  the queue plumbing already exist — sweep-as-refine-reason may be the cheapest
  human surface of all.
- A `/sweep` Claude Code skill orchestrating task_sweep + repo cross-checks.

## Recommended v1 (in order)

1. **Soft delete + trash purge** — the safety net everything else stands on.
   Small: `deleted_at` field, filter in `task-filters.ts`, `task-man trash`
   list/restore, purge rule.
2. **Deterministic archive + repair rules** as `task-man sweep` (dry-run
   default). Solves the unbounded-file problem before it exists and cleans the
   orphans already in the data.
3. **MCP `task_sweep` + Refine-mode cards** for the judgment layer — ships the
   AI angle once 1+2 have made every action it can propose reversible.

Deliberately not in v1: fuzzy dedup scoring (start with exact-ish title match),
auto-apply of anything AI-judged, archival compaction of `insights-log.json`.

## Open questions for Mario

- Archive as separate file (`archive.json`, keeps `tasks.json` small — my lean)
  vs. `archived: true` flag (simpler, no second file, but doesn't shrink polls)?
- Should metrics lookback read the archive transparently (personal-best/streak
  stay honest forever) or is 90 days of live history enough?
- Does the nightly droplet cron run deterministic sweep unattended, or is even
  archiving something you want to eyeball first?
