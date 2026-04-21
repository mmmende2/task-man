# Task Man — Session Notes & Change Log

Historical record of deviations from the PRD and implementation notes, grouped by session. Kept separate from the PRD so that planning new features stays context-light.

---

## Session 1 (2026-03-15) — Foundation

- **`summary` command replaced by `end-day`**: The PRD listed `summary` as a CLI command, but the plan consolidated daily summary functionality into `end-day` (with `--date yesterday` for standup prep). No separate `summary` command was created.
- **`focus`/`unfocus` commands added**: Not originally listed in the Phase 1 CLI commands, but specified in the Non-Interactive CLI section of the PRD. Implemented as part of Session 1.
- **Project structure**: Code lives in `cli/` subdirectory (not root) to leave room for future `mcp/`, `web/`, etc. directories.
- **No `chokidar`**: Watch mode uses `setInterval` polling instead of file-watching. Simpler, fewer deps, sufficient for the use case.
- **13 store tests**: Basic CRUD test suite via vitest covers add, persist, prefix resolve, update, query filters, scope inheritance, and date queries.

---

## Session 2 (2026-03-15) — MCP Server

- **9 tools instead of 8**: Added `task_search` (full-text case-insensitive substring search on title + description) beyond the PRD's original 8 MCP tools.
- **All MCP tools set `created_by: 'claude'`**: Since only Claude calls MCP tools, attribution is hardcoded rather than parameterized.
- **`cli/package.json` exports field added**: Enables `mcp/` to import specific modules (`store`, `types`, `config`, `report`, `render-html`, `email`) from the CLI package without monorepo tooling.
- **Stdio transport only**: No HTTP/SSE — Claude Code communicates via stdin/stdout JSON-RPC. Sufficient for local use.
- **No MCP Resources or Prompts**: Only Tools capability registered. Resources/Prompts deferred to future sessions if needed.

---

## Session 3 (2026-03-17) — Watch Mode + Ink

- **Watch mode rebuilt with Ink**: Replaced `console.clear()` + `setInterval` with Ink's React-based rendering. No more screen flicker. Component: `WatchApp.tsx`.
- **Shared UI component library created**: 9 reusable Ink components in `src/ui/shared/` designed for all future interactive modes (view, plan, write, metrics). Components use explicit string padding for box-drawing alignment rather than Ink's flex layout.
- **`useTaskStore` hook**: Wraps `TaskStore` with React state + optional `setInterval` polling. Accepts `TaskFilter` and `pollInterval` params.
- **JSX support added**: `tsconfig.json` updated with `"jsx": "react-jsx"`.
- **`watch.ts` uses `createElement`**: Kept as `.ts` (not `.tsx`) and uses `React.createElement` to avoid renaming the file.
- **No `ViewMode` reuse yet**: `WatchApp` has its own rendering logic. Will be refactored to use `<ViewMode isWatch={true} />` once ViewMode is built in a future session.

---

## Session 4 (2026-03-26) — Interactive Modes

- **View Mode renamed to Focus Mode**: `f` keybinding (was `v`). All references updated. The PRD originally called it "View Mode" but "Focus Mode" better describes its purpose — showing only focused tasks.
- **Emojis removed throughout**: All emoji usage replaced with text art across metrics mode (`[x]`/`[~]`/`[ ]`), terminal reports (`[x]`/`[~]`/`[+]`/`---`/`>>>`/`--`), subtask checkboxes (`◉`/`○`), and insight prefix (`>>>`). This is a TUI — text art fits the aesthetic better.
- **Subtask checkboxes redesigned**: Changed from `☑`/`☐` (hard to read at terminal font sizes) to `◉`/`○` (radio-button style, high contrast). Done subtasks use dim color to match done title text.
- **Scope cycling changed**: `Shift+Tab` replaced with `S` key across all modes. Simpler, more discoverable.
- **Done action changed**: `Space` replaced with `D` key in focus mode (later changed to `x` in session 6). `Space` retained in plan mode for focus toggle.
- **Subtask navigation implemented**: `Tab` toggles between task and subtask nav in focus mode. Border changes from cyan to white when in subtask nav. `j`/`k` cycles subtasks, `D` toggles subtask done status.
- **Encouraging messages overhauled**: Pools expanded from 5/5/8 to 15/15/12 messages. Selection changed from random-per-render to deterministic daily pick using day-of-year index — message stays stable throughout the day.
- **Test suite expanded**: 77 tests across 8 test files (was 50 across 5). New coverage: WriteMode (9 tests), MetricsMode (7 tests), focus mode ANSI color assertions (5 tests, require `FORCE_COLOR=1`), subtask navigation (5 tests), scope cycling, footer keybinding hints. Test helper extended with `rawText()`/`rawLines()` for ANSI-preserving assertions.

---

## Session 5 (2026-03-26) — ADHD-Informed Modifications

- **ADHD research conducted**: Three research documents created in `docs/` — brain overview, software UX patterns, and feature proposals. All modifications are grounded in specific ADHD mechanisms (time blindness, RSD, executive function deficits, dopamine system, etc.).
- **Write mode: priority phase eliminated**: Two-phase input (title → priority) replaced with single-phase. Enter saves immediately with default priority `medium` (was `high`). CLI-style flag parsing added (`-p high -c housework -s professional -d "notes" -f`). Live preview of parsed flags below input.
- **Metrics mode reframed**: "Done today: N" as hero metric (was "Completed: N | In Progress: N | Todo: N"). Stats line removed. Section renamed "Focused Tasks" → "Today's Progress". Tasks sorted done-first. Progress bar kept without percentage label.
- **Low-progress messages rewritten**: All 15 `MID_DAY_LOW` messages replaced with shame-free, progress-neutral alternatives. No references to counts, no implied struggling, focus on presence and process.
- **Negative insights removed**: `productivity_tip` insight type deleted (was the only critical one). `scope_balance` all-professional message reframed from directive to neutral observation. `InsightType` union reduced to 7 types.
- **Focus guardrails added**: Plan mode now has a configurable soft limit on focused tasks (default 3). Warning shown when exceeding: "You have N focused tasks. Add another?" Override persists for session. Config: `focus.maxFocused` in `~/.task-man/config.json`.
- **"Tomorrow's Focus" in end-of-day report**: New section showing remaining focused tasks (todo/in_progress), sorted by status then priority, capped at 5. Rendered in both terminal and HTML email.
- **Tests updated**: 73 passing tests (78 total, 5 skipped). 9 tests rewritten to match new write mode and metrics behavior, 1 new test added for flag parsing.

---

## Session 6 (2026-03-29) — Vim-like Keybindings

- **`useVimKeys` hook created**: Custom hook wrapping Ink's `useInput` with a three-mode state machine (`normal`, `insert`, `holding`). Multi-key sequences (`dd`, `cc`) use a key buffer ref with 300ms timeout. All state read inside callbacks uses `useRef` to avoid stale closures — a critical pattern for Ink's `useInput` which re-registers handlers via `useEffect`.
- **`useUndoStack` hook created**: Action-based undo (inverse operations pushed onto a ref-based stack, max 10 entries) rather than snapshot-based. Lighter weight and works across all mutation types.
- **Store extended with `remove()` and `insertAt()`**: Array-splice reordering — no `position` field needed. `remove` returns `{ task, index }` for undo support. `insertAt` clamps to bounds.
- **PlanMode fully rewritten**: All vim features — `dd`/`p` cut-paste reordering with cross-boundary focus toggling, `i`/`A`/`cc` inline title editing, `o`/`O` task creation, `x` mark done (replaced `D`), `u` undo, `/` real-time search filtering, `Space` toggle-focus with guardrail. Clipboard state tracks original position and focused status for undo. `dd` doubles as delete: `Esc` in holding mode confirms deletion (task stays removed, undoable via `u`), while `p`/`P` moves the task to a new position.
- **FocusMode rewritten**: Vim subset — `x` done, `dd`/`p` cut-paste (tasks and subtasks, with holding mode and undo), `i`/`A`/`cc` edit, `o`/`O` create (including subtasks via Tab into subtask nav on any task), `u` undo, `/` search, `Tab` subtask nav. Same `dd` semantics as plan mode: `Esc` confirms delete, `p`/`P` moves. Both `i` and `A` place cursor at end of title (user preference for backspace-to-delete workflow).
- **New shared components**: `InlineEdit.tsx` (editable text with magenta cursor block) and `SearchBar.tsx` (renders `/ query|`).
- **Footer updated**: Vim mode awareness — shows context-specific keybinding hints for normal, insert, and holding modes. Holding mode displays cut task title.
- **InteractiveApp guards global keys**: `vimMode` lifted to parent. Global `useInput` skips all keys when not in `normal` mode, preventing mode switches during editing.
- **`D` key replaced by `x`**: More vim-native for marking done. Works in both focus and plan modes.
- **Stale closure handling**: Ink's `useInput` re-registers handlers on every render (dependency array includes the handler function). Rapid keystrokes can arrive between renders, causing stale closure reads. Solution: combined state objects (e.g., `editState = { text, cursor }`) with functional updaters (`setEditState(prev => ...)`) which always receive latest state. Refs only needed for values mutated inside the handler itself between renders (`keyBufferRef`, `timeoutRef` in `useVimKeys`).
- **Test suite expanded**: 85 tests across 9 test files (was 73 across 8). New file: `vim-keys.test.tsx` with 12 integration tests covering store operations, cut/paste reorder, cancel cut, mark done, inline edit, task creation, search filtering, and undo.

---

## Session 7 (2026-03-29) — Vim Refinements

- **`dd` behavior unified**: In both plan and focus modes, `dd` cuts a task into clipboard and enters holding mode. `Esc` confirms deletion (task stays removed, undoable via `u`), while `p`/`P` pastes to move. Previously focus mode had immediate delete without holding mode.
- **`j`/`k` navigation in holding mode**: Arrow keys and `j`/`k` now work while holding a cut task, allowing navigation to the paste target.
- **Focus mode gets full cut/paste**: `dd`/`p`/`P` now work in focus mode for both tasks and subtasks. Pasting in subtask nav attaches the task as a subtask of the selected parent.
- **Plan mode key changed from `p` to `t`**: `p` conflicted conceptually with paste. `t` stands for "triage" which better describes the mode's purpose. Footer updated to show `t:triage`.
- **Expanded card alignment fixed**: `TaskRowExpanded` left margin reduced from 4 spaces to 1 space, aligning the priority dot at column 4 — same as non-selected `TaskRow`. Eliminates visual jumping when navigating with `j`/`k`. `cardInner` updated from `width - 4` to `width - 2`.
- **README created**: User-facing documentation with installation instructions (including nvm), CLI command reference (all 9 commands with flags and examples), interactive mode guide with vim keybinding tables, and MCP server setup + tool reference (all 9 tools with parameter tables).
- **Global install set up**: `npm link` for both `cli/` and `mcp/` packages, making `task-man` and `task-man-mcp` available on PATH.

---

## Session 8 (2026-04-12) — Category Tree View & Visual Polish

- **Category label in expanded cards**: `StatusBadge` (showing `todo`/`done`) replaced with category name in `TaskRowExpanded`'s bottom border. Falls back to status if no category is set. `StatusBadge` import removed.
- **Triage page rewritten as category tree view**: `PlanMode` no longer shows `FOCUSED`/`BACKLOG` sections. Tasks are grouped by first category with tree connectors (`├─`/`└─`), `★` indicator for focused tasks, `▸` selection marker. Category headers are visual-only — `j`/`k` navigation naturally skips them. `TaskRow` and `SectionDivider` imports replaced with `PriorityDot` and inline tree rendering. New tasks created via `o`/`O` inherit the selected task's category and focused status. Uncategorized tasks grouped under `uncategorized` label, sorted last.
- **Focus page single-line expanded view**: Tasks with no subtasks render as a single line (`── ● Title ──── category ──`) instead of the full box (`┌─ ... ─┐`, `│`, `└─ ... ─┘`). The three box sides (left, right, bottom) are removed; only the horizontal line remains. Cyan highlighting preserved. Category label positioned on the right of the single line. Full box view returns automatically when subtasks are added.
- **Tab into empty subtasks starts creation**: Pressing `Tab` on a focused task with no subtasks immediately enters insert mode for subtask creation (sets `navTarget`, `creatingAt`, and `vimMode` in one action). Previously, `Tab` would enter subtask nav with nothing to navigate.
- **Metrics page: pulsing dot for fully-done tasks**: Parent tasks where the task and all subtasks are done get a `◉` dot pulsing through cyan shades (`#00ffff` → `#00cccc` → `#009999` → `#00cccc`) at 400ms — same cadence as `PulsingProgressBar`. Title text stays static cyan. Non-done tasks show standard `◉`/`○` markers.
- **Metrics page: radio-style markers**: Parent task markers changed from `●`/`○` (PriorityDot) to `◉`/`○`, matching the subtask checkbox style for visual consistency.
- **Metrics page: separate task/subtask counts**: "Done today" hero metric now counts only parent tasks (`parent_id === null`). Subtasks completed today shown separately in existing "Subtasks: N" indicator. `buildDayReport` filters `completedTasks` to exclude subtasks before computing `completed`, `completedByHuman`, and `completedByClaude` stats.
- **Data migration: category conversion**: Old parent tasks (house work, pew projects, truck mods, outdoor/patio) converted to category tags on individual tasks via MCP. Old subtasks under deleted parents had `completed_at` backdated from `2026-04-12` to `2026-04-11` using `jq` to avoid inflating today's metrics.
- **Test suite updated**: 84 passing tests across 9 files. `planmode-interaction.test.tsx` rewritten for tree view assertions (category grouping, `★` focused indicator, `▸` selection). `viewmode-interaction.test.tsx` updated for single-line expanded view (`──` instead of `┌`). `vim-keys.test.tsx` updated for tree view (no `FOCUSED (N)` sections). `metrics-display.test.tsx` updated for `◉`/`○` markers.
