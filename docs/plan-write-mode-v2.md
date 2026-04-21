# Plan: Write Mode v2 — Capture + Review with Category-Aware Autocomplete

## Context

Today's write mode (`cli/src/ui/modes/WriteMode.tsx`) is a single rapid-entry field with a checkmark log of entries and flag parsing (`-p -c -s -d -f`). It works for dumping thoughts but has three gaps that are hurting day-to-day use:

1. **Categories don't surface.** Users can't see what categories already exist, so they type ad-hoc variants ("house worrk", "housework", "House Work") and drift toward using parent tasks as pseudo-categories (per `todo.md` and `PRD.md` scope vs. category confusion).
2. **No post-capture edit.** Once a task is saved, there's no in-write-mode way to adjust it — you have to exit to plan/focus, losing the rapid-fire rhythm when you realize five entries in that they all belong to one category.
3. **The screen is sparse.** The top half is an almost-empty checkmark list. It could be doing real work: showing the session's tasks organized by category, with subtasks.

The goal is a vim-style two-phase flow inside write mode — **Capture** (insert-ish: fast typing with category autocomplete and inline spell-fix suggestions) and **Review** (normal-ish: vim nav over entries with one-key edits for category/priority/title). Preserves the current fast-entry default; `Esc` drops into Review, `i` returns to Capture.

## Design

### Two sub-modes inside WriteMode

| Sub-mode | Role | Enter via | Exit via |
|---|---|---|---|
| **Capture** (default on entering write mode) | Type tasks fast; flags + autocomplete | `i` from Review | `Esc` → Review |
| **Review** | Vim nav over entries; one-key edits | `Esc` from Capture | `Esc` → focus mode; `i` → Capture |

Rationale: mirrors vim (capture≈insert, review≈normal) and matches the user's "`i` for insert" request while preserving today's fast-start UX (write mode still opens ready to type).

### Capture layout (upgrades the existing screen)

```
  [session · today · all]              ← scope-in-time filter (top-left chip)

  House Work                           ← category group header
    ● clean dishes
      └─ load dishwasher
    ● buy detergent
  Writing
    ● draft newsletter
  (uncategorized)
    ● fix login bug

  > clean windows -c hou█              ← input, cursor
      ↳ House Work                     ← ghost suggestion (Tab accepts)
  Priority: high | Category: House Work  ← live preview (existing)
  Start with ":" to add subtask of ...   ← existing subtask hint
```

- Top pane replaces the current checkmark log. Tasks are grouped by first category, subtasks shown indented (user explicitly wants subtasks here, unlike triage). Session color tint (existing `getSessionHexColor`) highlights tasks from this session.
- A single-line chip at the top shows the active time-filter: `session · today · all` with the active one bright.
- Input and preview stay pinned to the bottom (matches today).

### Review layout

Same screen, but:
- The input area dims and stops capturing keystrokes.
- A `›` cursor appears on the selected task in the top pane (first task of first group on entry).
- Footer swaps to Review keybindings.

### Category autocomplete (Capture)

When the user types `-c <partial>` (whitespace-delimited token after `-c`):

1. Compute the candidate list from all existing task categories, ranked:
   - **Exact prefix match** (case-insensitive) first, ordered by task-count desc.
   - **Fuzzy match** (Levenshtein ≤ 2 on the partial) second.
2. Render the top match as a **ghost continuation** in dim text right after the partial: `-c hou` + dim `se Work`.
3. If there are 2+ candidates, render a compact one-line list below the preview: `  ↳ House Work · House Prep · Housing Search` (top first bold).
4. **Tab** = accept top ghost → rewrites the token to the canonical casing. **Ctrl+N** / right-arrow = cycle through list. Typing past the ghost dismisses it.

### Inline spell-fix suggestion (Capture)

When the typed `-c` value is a near-miss (Levenshtein 1–2) but not a prefix of any existing category — e.g. `-c house worrk` — show a **suggestion line** below the preview:

```
  ↳ Did you mean: House Work?  [tab]
```

Tab accepts (rewrites the -c token to canonical). Typing keeps the user's version (no automatic rewrite on Enter). This keeps the experience advisory, not prescriptive, matching ADHD-UX docs' "one-action principle" (don't block the save).

Shared fuzzy logic with autocomplete — one helper module, two callers.

### Review keybindings (single-key, operate on selected entry)

| Key | Action |
|---|---|
| `j` / `k` | Move selection down/up across all visible entries (across category groups) |
| `i` | Switch back to Capture (input regains focus) |
| `c` | Edit category: inline mini-input with the **same autocomplete + spell-fix** as Capture. Enter saves, Esc cancels. |
| `p` | Cycle priority: low → medium → high → low |
| `s` | Cycle scope: personal ↔ professional |
| `f` | Toggle focused |
| `x` | Toggle status done / todo |
| `cc` | Edit title inline (reuse `InlineEdit` + `useVimKeys` patterns from PlanMode/FocusMode) |
| `dd` | Delete entry (use existing undo stack via `useUndoStack`) |
| `u` | Undo (existing hook) |
| `T` | Cycle time-filter: session → today → all |
| `Esc` | Exit write mode (to focus mode) |

Reuse the existing vim scaffolding — this mode should feel like PlanMode's edit layer, not a bespoke handler.

### Time-filter semantics

- **session** (default): `task.session_id === currentSessionId` — matches today's session-color story.
- **today**: `created_at` starts with today's local date.
- **all**: non-done tasks across the board (capped at, say, 100 rows for safety), still grouped by category.

`T` in Review cycles. In Capture, the chip is read-only (user must `Esc` to Review to change it) — keeps the capture keyboard fully reserved for typing.

## Files to modify

- **`cli/src/ui/modes/WriteMode.tsx`** — primary refactor. Split the single `useInput` handler into a `subMode: 'capture' | 'review'` state machine. Extract two presentational components:
  - `cli/src/ui/modes/write/CapturePane.tsx` — input, ghost, suggestion line, live preview.
  - `cli/src/ui/modes/write/ReviewPane.tsx` — vim nav + per-entry editors. Delegate title/date editing to existing `InlineEdit` and undo to `useUndoStack`.
  - `cli/src/ui/modes/write/EntryList.tsx` — shared read-only list rendering (category groups, subtasks, selection cursor). Used by both panes.
- **`cli/src/ui/shared/Footer.tsx`** — add branches for `mode === 'write' && subMode === 'review'` (nav + edit keys) vs Capture (existing). Thread `subMode` via a new optional prop, mirrored on WriteMode's footer controller.
- **`cli/src/ui/types.ts`** — no change to `AppMode`; sub-mode is internal to WriteMode.
- **New: `cli/src/ui/hooks/useCategoryMatch.ts`** — pure helper:
  ```ts
  getAllCategories(tasks): { name: string; count: number }[]
  suggestPrefix(partial, cats): { top?: string; list: string[] }   // prefix-match ranked by count
  suggestFuzzy(partial, cats): string | null                       // Levenshtein ≤ 2, not a prefix
  ```
  No external deps — Levenshtein is ~20 lines. Export a single `useCategoryMatch(inputText)` hook that parses the `-c` token, returns `{ ghost, list, didYouMean }`.
- **No store/schema changes.** Categories remain derived from `tasks[].categories`. Session color reuses `getSessionHexColor` from `cli/src/sessions.ts`.

## Reuse (don't rebuild)

- `parseWriteInput` / `formatPreview` (WriteMode.tsx:42–125) — keep as-is; wrap the `-c` token handling to expose the partial for autocomplete.
- `InlineEdit` (`cli/src/ui/shared/InlineEdit.tsx`) — use for Review's title/category edit fields.
- `useVimKeys` (`cli/src/ui/hooks/useVimKeys.ts`) — drive Review nav. Review's `cc`/`dd` should use the existing holding-mode pattern so behavior matches Plan/Focus.
- `useUndoStack` (`cli/src/ui/hooks/useUndoStack.ts`) — for `dd` and `u`.
- `getSessionHexColor` (`cli/src/sessions.ts`) — session-color tint in EntryList.
- Category-group rendering pattern (PlanMode.tsx:75–97) — port the grouping logic to `EntryList` so Write and Plan stay visually consistent.

## Out of scope (explicitly deferred)

- **AI-assisted prioritization / organization.** User explicitly said "too soon for direct AI integration" — the smart bits here are pure-string heuristics (prefix + Levenshtein), not model calls.
- **Category rename across all tasks.** A Review edit only changes one task's category at a time. Bulk rename is a future add.
- **Priority-first sort / Eisenhower view.** User noted priority is on the back burner; Review's `p` key covers ad-hoc changes without restructuring the view.
- **Subtask reparenting in Review.** Promoting/demoting subtasks via vim keys is tempting but out of scope — covered well enough by the existing `:` prefix in Capture.

## Verification

1. **Build & type-check**: `cd cli && npm run build` (or `tsc --noEmit`) after the refactor.
2. **Unit tests** (Vitest, follow `cli/src/__tests__/*.test.tsx` patterns):
   - `useCategoryMatch.test.ts`: prefix match ranking by count; Levenshtein fuzzy "house worrk" → "House Work"; no suggestion when exact match.
   - `WriteMode.test.tsx`: sub-mode transitions (`Esc` capture→review, `i` review→capture, `Esc` review→focus). Tab accepts ghost and rewrites input. `T` cycles time filter.
3. **Manual golden path** (run `cli/dist/index.js` or `npm start`):
   - Enter write mode → type `clean dishes -c hou` → see ghost "se Work" (assuming prior "House Work" exists) → Tab → input shows `-c "House Work"` → Enter → entry appears under **House Work** group in top pane.
   - Type `draft note -c house worrk` → see "Did you mean: House Work?" → ignore, press Enter → task saved with `house worrk` (advisory, not forced). Press `Esc` → Review → navigate to the task → press `c` → autocomplete fixes it.
   - `Esc` to Review → `j`/`k` navigation works across category groups → `p` cycles priority → `x` marks done (row greys) → `u` undoes → `i` returns cursor to input.
   - `T` cycles session → today → all; entries list updates accordingly.
4. **Data safety check**: Kill the app mid-edit — `~/.task-man/tasks.json` should stay valid JSON (existing `withLock` + temp-file rename in `store.ts` already handles this; just verify we're still routing through `store.update`).
5. **Regression**: existing WriteMode tests (`cli/src/__tests__/*.test.tsx` that touch write mode) should still pass — Capture's save path is unchanged on the store side.
