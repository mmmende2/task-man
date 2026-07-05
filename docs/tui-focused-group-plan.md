# TUI Focused-Group Plan — pin focused tasks atop triage

Status: **planned** (2026-07-05, approach approved). Not yet implemented.

## The gap

There is no TUI surface that lets you *round up* focused tasks and unfocus
them:

- **Focus mode** shows only focused tasks but deliberately blocks unfocus
  (`FocusMode.tsx` — "toggle-focus not supported in focus mode").
- **Triage / Plan mode** *can* unfocus (Space toggles focus), but focused
  tasks are scattered across their category groups with a trailing `★`, so
  collecting them is a hunt.
- **Web Backlog** solves this well: it pins a **Focused** group (with a
  count) at the top, above the Backlog group, each row one tap from unfocus.

This plan ports that web pattern into TUI triage: a pinned `★ focused (N)`
group at the top of Plan mode, above the category tree. Space still
unfocuses — the task visibly drops from the top group down into its
category, and (because the cursor is id-anchored) the cursor rides along.

## Decision (approved)

Pin a **Focused group at the top of triage**, always visible. No new
keybinding, no new mode — Space (`toggle-focus`) already does the work; we
just make the focused set easy to see. Chosen over a focused-only filter
toggle and over enabling unfocus in Focus mode.

## Base / dependency

Builds on **PR #14 (id-anchored cursors)** — branch `feat/tui-focused-group`
is cut from `fix/id-anchored-cursors`. The id-anchored cursor is what makes
the unfocus interaction feel right: when a task leaves the Focused group and
reappears under its category, `selPos = orderedTasks.findIndex(cursorId)`
keeps the cursor on that same task. Land after #14 merges (or stack on it).

## What changes (all in `cli/src/ui/modes/PlanMode.tsx`)

### 1. Grouping — stop merging focused into the category tree
Today (`useMemo` at ~L104): `const all = [...filteredFocused, ...filteredBacklog]`,
then group *all* by category. Change to:

- **Focused pseudo-group** = `filteredFocused` verbatim — every focused
  task, regardless of category and **regardless of category-hide state**.
- **Category groups** built from `filteredBacklog` only (same sort: named
  categories alphabetical, uncategorized last; hidden categories skipped).
- `orderedTasks = [...filteredFocused, ...backlogFlat]` — focused first, so
  the flat index the cursor walks matches the on-screen order.

Represent the section split so render knows which header to draw — either a
`kind: 'focused' | 'category'` tag on the group objects, or render
`filteredFocused` as a dedicated pinned block before the category loop.
Either way `taskRowPositions` must be built focused-rows-first to stay
aligned with `orderedTasks`.

### 2. Render — the pinned header + rows (~L479 region)
- Header, only when `filteredFocused.length > 0`:
  `  ★ focused (N)` — yellow `★`, dim count. Distinct from the dim
  lowercase category headers.
- Focused rows: flat (no `├─ └─` tree connectors), priority dot + title,
  cursor glyph when selected, scope tag when `scopeFilter === 'all'`, done
  `✓`. **Drop the trailing `★`** inside this group — the header already
  says it (keep `★` only where focused tasks can still appear mixed, which
  is now nowhere).
- One spacer row, then the existing category groups (backlog only), verbatim.

### 3. Delete the hidden-focused bottom strip — subsumed
`hiddenFocusedTasks` (~L165), its band in the scroll math
(`hiddenFocusedBand`, ~L580–581), and its bottom render block (~L625) all
exist so focused tasks in a hidden category aren't lost. With focused tasks
pinned at the top unconditionally, that case is gone. Remove all three.

### 4. Category panel counts
The tree below now shows only unfocused tasks per category, so make the
parenthetical count reflect that (unfocused-in-category) and keep the `★N`
indicator to signal "N focused from here are up top." Low-stakes; the only
alternative is leaving totals and accepting a panel-vs-tree mismatch.

### 5. Footer (`cli/src/ui/shared/Footer.tsx`)
Plan `pageContent` hint `spc:focus` → `spc:focus/unfocus` for
discoverability. Space already toggles both directions; this only relabels.

## Not changing
- Focus mode stays the work surface (start / complete / subtasks); it does
  **not** gain unfocus.
- No new keybinding; `~` scope filter and `/` search still apply (focused
  group already respects both — `filteredFocused` is search-filtered and
  scope is applied upstream in `InteractiveApp`).
- Create (`o`/`O`) still inherits the neighbor's focused state, so creating
  next to a focused row makes a focused task that lands in the top group —
  consistent, no change needed.

## Tests
- `cli/src/__tests__/` (alongside `mode-switching.test.tsx`): Plan mode
  renders `★ focused (N)` at the top with the focused set; a category group
  below holds only unfocused tasks; Space on a focused row unfocuses it and
  it moves out of the top group; the cursor stays on that task (id-anchored).
- Empty states: no focused → no Focused header; all focused → only the top
  group; nothing → "No tasks."

## Docs to touch
- `docs/system-map.md` — Plan mode grouping description.
- `PRD.md` — if it describes triage grouping.
- `docs/controls-audit.md` — note triage now pins focused at top (Space
  unfocuses there).

## Web parity note
TUI triage keeps category grouping for the *backlog* portion (the web uses a
category filter drawer instead), but the shared idea — focused pinned on top
with a count, one keystroke/tap from unfocus — now holds on both surfaces.
