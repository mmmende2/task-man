# Task Man — Product Requirements Document

## Overview

**Task Man** is a personal task manager built for developers who live in the terminal. It replaces pen-and-paper task tracking with a fast, beautiful CLI tool that stays open in a terminal pane. What makes it unique: AI agents like Claude can read and write tasks through the same system via MCP, so human and AI progress is tracked in one place.

---

## Problem Statement

- Pen-and-paper task lists don't sync, aren't searchable, and can't generate metrics
- Existing task managers (Todoist, Things, etc.) require context-switching away from the terminal
- AI assistants complete work but don't leave a trail in your personal task system
- Standup prep requires manually recalling what you did yesterday

---

## Users

| User | Interface | Description |
|------|-----------|-------------|
| **Mario (Human)** | CLI (interactive) | Views, creates, and completes tasks in a long-running terminal session |
| **Claude (AI)** | MCP / CLI (non-interactive) | Creates tasks, updates status, closes tasks as it works on them |
| **Mario (Mobile/Web)** | Web UI (future) | Views and manages tasks from phone or another machine |

---

## Data Model

### Task

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | Yes | Auto-generated |
| `title` | string | Yes | Short, scannable title |
| `description` | string | No | Longer details, context, notes |
| `status` | enum | Yes | `todo`, `in_progress`, `done` |
| `priority` | enum | Yes | `low`, `medium`, `high`, `urgent` |
| `scope` | enum | Yes | `personal`, `professional` |
| `categories` | string[] | No | Many categories per task (e.g., `["housework", "errands"]`) |
| `parent_id` | UUID \| null | No | If set, this task is a subtask |
| `created_at` | ISO datetime | Yes | Auto-set on creation |
| `updated_at` | ISO datetime | Yes | Auto-set on mutation |
| `completed_at` | ISO datetime \| null | No | Set when status → `done` |
| `focused` | boolean | Yes | `true` = on your plate now, `false` = backlog. Defaults to `false` |
| `created_by` | string | Yes | `"human"` or `"claude"` — tracks who created it |

### Design Decisions

- **Scope vs. Categories**: `scope` is a top-level partition (`personal` / `professional`) — every task has exactly one. `categories` are freeform tags for finer grouping within a scope. This keeps the two concepts separate and filterable.
- **Subtasks inherit parent scope**: A subtask assumes the parent's `scope` by default. Categories can optionally diverge.
- **Status**: Three states — `todo` (not started), `in_progress`, `done`. No "undefined" state; new tasks default to `todo`.
- **`created_by` field**: Tracks whether a human or AI created/completed the task. Useful for metrics and standup summaries.
- **Focused vs. Backlog**: `focused` is a boolean that determines whether a task appears in view mode. New tasks default to backlog (`focused: false`). You pull tasks into focus via plan mode. This keeps view mode tight — only what you've committed to working on right now.

---

## CLI Interface

### Modes

The interactive CLI has four modes:

#### Focus Mode (default)
```
╔══════════════════════════════════════════════════╗
║  TASK MAN                             per  FOCUS ║
╚══════════════════════════════════════════════════╝

    ┌─ ○ Fix auth token refresh 2/3 ▰▰▱ ─────────┐
    │                                               │
    │  Token expires mid-session causing 401s       │
    │                                               │
    │   ○ Investigate token lifecycle               │
    │   ◉ Add refresh logic to middleware           │
    │   ○ Write integration test                    │
    │                                               │
    └──────────────────────────── in_progress ──────┘

    ○ Update API docs for v2 endpoints    2/5 ▰▰▱
    ○ Review PR #847                      0/3 ▱▱▱

  + 8 more in backlog

╔══════════════════════════════════════════════════╗
║  p:plan w:write m:metrics S:scope                ║
║                          jk:nav tab:subtasks D:done ║
╚══════════════════════════════════════════════════╝
```

- **Focus mode only shows focused tasks** — tasks you've pulled into focus via plan mode
- **Priority indicator**: A colored dot (`●`/`○`) on each task — magenta = high, cyan = medium, dim = low. Compact and always visible without taking space.
- **Subtask checkboxes**: `◉` (done, dimmed) / `○` (todo) — radio-button style, no emojis
- **Secondary tasks show progress** instead of priority text: `2/5 ▰▰▱` (subtasks completed / total with a mini progress bar). Priority is still visible via the dot color.
- **Backlog count** shown below secondary tasks: `+ 8 more in backlog`. Unobtrusive reminder that more work exists without cluttering the view.
- **Header shows scope + mode label** (e.g., `per  FOCUS`). Scopes abbreviated: `pro` / `per`.
- One **focused task** shown large with full details, description, and subtasks
- Remaining **peripheral tasks** shown smaller with progress bars
- `j`/`k` or arrow keys to navigate between tasks
- `Tab` to enter subtask navigation on the expanded task (border changes from cyan to white); `j`/`k` to cycle subtasks; `Tab` again to return to task nav
- `D` to mark the selected task or subtask as done
- `S` to cycle scope filter (`all` → `personal` → `professional`)
- Status bar shows scope and progress count

#### Plan Mode
```
╔══════════════════════════════════════════════════╗
║  TASK MAN  ◈ plan                pro · all       ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  FOCUSED (3)                                     ║
║    ● Fix auth token refresh         in_progress  ║
║    ● Update API docs for v2         in_progress  ║
║    ○ Review PR #847                 todo         ║
║                                                  ║
║ ─────────────────────────────────────────────── ║
║  BACKLOG (8)                                     ║
║    ● Refactor logger module         todo         ║
║    ○ Set up CI caching              todo         ║
║    ○ Investigate flaky test          todo         ║
║    ○ Update dependencies             todo         ║
║    ···5 more                                     ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║  f:focus w:write m:metrics S:scope               ║
║                              jk:nav spc:focus    ║
╚══════════════════════════════════════════════════╝
```

- **Plan mode is where you decide what to work on.** It shows all tasks split into two lists: focused and backlog.
- **Space** toggles a task between focused and backlog — pull tasks in when you're ready, push them back when your plate is full
- `j`/`k` or arrow keys navigate the combined list (crosses from focused to backlog seamlessly)
- The view is intentionally flat — no subtask expansion, just titles and status. This is a triage view, not a detail view.
- Press `f` to return to focus mode with your newly curated focus list
- `S` to cycle scope filter
- **Future AI integration**: In plan mode, an AI could suggest which backlog tasks to focus on based on priority, deadlines, scope balance, and what you completed recently

#### Write Mode
```
╔══════════════════════════════════════════════════╗
║  TASK MAN  ✎ write                              ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  New task: do dishes - housework                 ║
║                                                  ║
║  → Title: do dishes                              ║
║  → Category: housework                           ║
║  → Scope: personal                               ║
║  → Priority (l/m/h/u): _                         ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║  esc:back  S:scope              enter:add  :subtask ║
╚══════════════════════════════════════════════════╝
```

- Continually accepts tasks — after one is saved, the prompt immediately reappears
- **Two-phase input**: Type title → press Enter → select priority (`l`/`m`/`h` or Enter for high)
- **Quick-entry syntax**: `task title - category` on one line (dash-delimited)
- **Subtask syntax**: `: subtask title` adds a subtask to the most recently created task
- After entering a title, it prompts for priority. Scope is inherited from the active scope filter.
- ESC returns to focus mode; `S` cycles scope
- No confirmation dialogs — tasks are saved immediately

#### Metrics Mode
```
╔══════════════════════════════════════════════════╗
║  TASK MAN                           METRICS      ║
╚══════════════════════════════════════════════════╝

  Focus progress  3/5 ▰▰▰▱▱ 60%

  Completed: 3  |  In Progress: 1  |  Todo: 1
  You: 2  |  Claude: 1

  --- Focused Tasks ---
  [x] Fix auth token refresh           [you]
  [x] Write integration test           [claude]
  [~] Update API docs for v2           [you]
  [ ] Review PR #847                   [you]

  >>> You completed 2 more tasks than yesterday!
  You're on fire today, don't stop now!

╔══════════════════════════════════════════════════╗
║  f:focus  p:plan  w:write             e:end-day  ║
╚══════════════════════════════════════════════════╝
```

- **Metrics mode is the progress dashboard.** Press `m` from any mode to see how your day is going.
- **Progress bar**: Visual completion % of today's focused tasks (magenta ▰▱ bar)
- **Stats row**: Completed / In Progress / Todo counts, split by you vs Claude
- **Focused task list**: Today's focused tasks with text-art status icons (`[x]` done, `[~]` in progress, `[ ]` todo) and attribution — no emojis
- **Insight**: One data-driven insight from the Insights Engine, prefixed with `>>>` (see below)
- **Encouraging message**: Deterministic daily motivational message — changes once per day, not randomly per render (see Encouraging Messages below)
- **Keybindings**: `f` → focus, `p` → plan, `w` → write, `e` → trigger end-of-day email

### Non-Interactive CLI

For AI agents and scripts:

```bash
# Add a task
task-man add "Fix auth bug" --priority high --scope professional --category backend

# Add a subtask
task-man add "Write test" --parent <task-id>

# List tasks
task-man list --scope professional --status in_progress
task-man list --focused          # only focused tasks
task-man list --backlog          # only backlog tasks

# Update status
task-man done <task-id>
task-man start <task-id>

# Focus management
task-man focus <task-id>         # pull into focus
task-man unfocus <task-id>       # send to backlog

# End of day report (also great for standup prep)
task-man end-day
task-man end-day --date yesterday
task-man end-day --email         # send report via email

# Watch mode (live-updating view, no interaction)
task-man watch
```

---

## MCP Server

The MCP (Model Context Protocol) server exposes task-man's functionality to AI agents like Claude. Here's a primer on what this means:

### What is MCP?

MCP is a protocol that lets AI assistants call tools on your machine. When you configure an MCP server in Claude Code, Claude gains the ability to call functions you define — similar to how a REST API works, but the "client" is an AI model.

### Task Man MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `task_add` | Create a new task | `title`, `priority?`, `scope?`, `categories?`, `parent_id?` |
| `task_list` | List tasks with filters | `scope?`, `status?`, `category?`, `limit?` |
| `task_update` | Update a task's fields | `id`, `title?`, `status?`, `priority?`, `categories?` |
| `task_complete` | Mark a task as done | `id` |
| `task_start` | Mark a task as in_progress | `id` |
| `task_end_day` | End of day report | `date?` (defaults to today), `email?` (boolean, send via email) |
| `task_focus` | Pull a task into focus | `id` |
| `task_unfocus` | Send a task to backlog | `id` |
| `task_search` | Full-text search across tasks | `query` |

### How Claude Would Use It

Once configured, Claude could:
1. **Before starting work**: Check `task_list` to see what's on your plate
2. **During work**: Call `task_start` on the relevant task, add subtasks as it breaks down work
3. **After completing work**: Call `task_complete` to close it out
4. **For standup**: You ask "what did I do yesterday?" and Claude calls `task_end_day`

The key insight: since both human and AI write to the same task store, your view mode updates in real-time to reflect AI progress too.

---

## End of Day Report

Invoked via `task-man end-day`, the `/end-day` Claude Code skill, or the `task_end_day` MCP tool. This is the daily wrap-up — run it before you close your laptop.

```
╔════════════════════════════════════════════════════╗
║  END OF DAY — 2026-03-14                           ║
╠════════════════════════════════════════════════════╣

  [x] Completed today (4)
    ● Fix auth token refresh          [you]
    ● Write integration test          [claude]
    ● Review PR #847                  [you]
    ● Do dishes                       [you]

  [~] In Progress (2)
    ● Update API docs for v2          2/5 ▰▰▱
    ● Refactor logger module          0/3 ▱▱▱

  [+] Started today (3)
    ● Refactor logger module
    ● Update API docs for v2
    ● Do dishes

  ──────────────────────────────────────────────────
  --- Stats
    Completed:   4  (3 you · 1 claude)
    Started:     3
    In progress: 2  (carrying over to tomorrow)
    Completion:  67%

╚════════════════════════════════════════════════════╝
```

- **Completed today**: Tasks whose `completed_at` falls on this day, with attribution
- **Worked on / In Progress**: Tasks with status `in_progress` that were updated today, with subtask progress
- **Started today**: Tasks whose `created_at` falls on this day (shows new work that entered the system)
- **Stats block**: Counts for completed, started, still in progress; completion rate; human vs. AI split
- Also usable for standup prep: `task-man end-day --date yesterday`
- Available via `task-man end-day` CLI, `/end-day` Claude skill, or `task_end_day` MCP tool

### Email Delivery

The end-of-day report can be emailed so you can reference it the next morning for standup or share it with other tools.

**Email content** extends the standard report with an insight and encouraging message:

```
Subject: Task Man — End of Day (2026-03-15)

╔════════════════════════════════════════════════════╗
║  END OF DAY — 2026-03-15                           ║
╠════════════════════════════════════════════════════╣

  [x] Completed today (4)
    ● Fix auth token refresh          [you]
    ● Write integration test          [claude]
    ● Review PR #847                  [you]
    ● Do dishes                       [you]

  [~] In Progress (2)
    ● Update API docs for v2          2/5 ▰▰▱
    ● Refactor logger module          0/3 ▱▱▱

  [+] Started today (3)
    ● Refactor logger module
    ● Update API docs for v2
    ● Do dishes

  --- Stats
    Completed:   4  (3 you · 1 claude)
    Started:     3
    In progress: 2  (carrying over)
    Completion:  67%

  >>> Insight
  You completed 2 more tasks than yesterday and
  had your best completion rate this week!

  -- What a day. Look at everything you got done.

╚════════════════════════════════════════════════════╝
```

**Trigger mechanisms**:
1. **Manual**: `e` key in metrics mode, or `task-man end-day --email` from CLI
2. **Auto-prompt on quit**: When quitting after a configurable time (default: 5pm), prompt: `"Send end-of-day report? (y/n)"`

**Delivery**: Uses the [Resend](https://resend.com) API. See Email Configuration below.

---

## Insights Engine

A module that generates data-driven observations by comparing today's activity against historical data.

### Insight Types

| Insight | Logic | Example |
|---------|-------|---------|
| **vs. Yesterday** | Compare today's completed count to yesterday's | "You completed 2 more tasks than yesterday!" |
| **Personal best** | Check if today's completed count is the highest ever | "New record! Most tasks completed in a single day!" |
| **Streak** | Count consecutive days with ≥1 completion | "You're on a 5-day streak of completing tasks!" |
| **Scope balance** | Compare personal vs professional task ratio | "Today was all professional — don't forget personal tasks!" |
| **AI collaboration** | Highlight human/AI split | "Claude handled 3 tasks for you today — teamwork!" |
| **Velocity trend** | Compare this week's avg to last week | "Your weekly pace is up 20% from last week." |
| **Productivity tip** | Based on patterns (e.g., too many tasks started, few completed) | "You started 5 new tasks but only completed 1 — try finishing before starting new ones." |
| **Focus ratio** | Ratio of focused tasks completed vs total | "You completed all your focused tasks today — great prioritization!" |

### Selection Logic

- Pick the most "interesting" insight available (prioritize records, then comparisons, then tips)
- Never repeat the same insight type on consecutive days
- Productivity tips only appear when the pattern is clear (e.g., 3+ days of low completion relative to starts)

### Data Requirements

The existing data model already supports all insights — no schema changes needed:
- `completed_at` → tasks completed per day
- `created_at` → tasks started per day
- `created_by` → human vs AI attribution
- `scope` → personal vs professional split
- `focused` → focus ratio tracking

The insights engine queries the task store with date filters to compute all metrics.

---

## Encouraging Messages

Two pools of motivational messages with distinct tones for different contexts. All messages use plain text — no emojis.

### Mid-Day Messages (Metrics Mode)

Two sub-pools based on progress:

**High progress (>= 50%)** — 15 messages with energy/momentum tone:
- "You're on fire today, don't stop now!"
- "Shipping machine. Keep it rolling."
- "Clear eyes, full lists, can't lose."
- _(12 more — see `messages.ts`)_

**Low progress (< 50%)** — 15 messages with supportive tone:
- "Hang in there. Every task done is a win."
- "The hardest part is starting. You already did that."
- "Brick by brick. You're building something."
- _(12 more — see `messages.ts`)_

**Selection**: Deterministic daily pick using day-of-year index into the pool. The message changes once per day, not on each render. The pool is selected based on progress percentage.

### End-of-Day Messages (Email & Report)

Tone: Closure, accomplishment, rest. 12 messages:

- "What a day. Look at everything you got done."
- "Today's diff: +progress, -stress. Ship it."
- "Good work compounds. Today was an investment."
- _(9 more — see `messages.ts`)_

**Selection**: Deterministic daily pick (same `dailyPick` function). Message is included in both the terminal report and the email version.

---

## Email Configuration

### Setup

Email delivery uses the [Resend](https://resend.com) API. Configuration is stored in `~/.task-man/config.json`.

```bash
# Configure email
task-man config email.resendApiKey <key>
task-man config email.to <address>
```

### Config schema (`~/.task-man/config.json`)

```json
{
  "email": {
    "resendApiKey": "re_...",
    "to": "mario@example.com",
    "autoPromptAfter": "17:00"
  }
}
```

- `email.resendApiKey` — Resend API key for sending email
- `email.to` — Recipient email address
- `email.autoPromptAfter` — Time after which quitting prompts to send the end-of-day report (default: `"17:00"`, set to `null` to disable)

---

## Backend / Storage

### Phase 1: Local JSON File

- Tasks stored in a single JSON file (e.g., `~/.task-man/tasks.json`)
- File-based locking for concurrent access (CLI + MCP server both writing)
- Portable — copy the file to another machine and you're set
- The MCP server and CLI both read/write this same file

### Phase 2: Node.js API Server (future)

- REST API backed by SQLite or PostgreSQL
- Enables web UI, mobile access, multi-device sync
- MCP server becomes a thin client to this API
- CLI can work in either local mode or API mode

---

## AI Integration Roadmap

### Phase 1: MCP Read/Write (PoC)
- Claude can create, update, complete tasks via MCP tools
- Human and AI actions are logged with `created_by`

### Phase 2: AI-Assisted Task Entry
- In write mode, raw input like "I need to do the dishes" gets parsed by AI
- AI infers: title = "Do dishes", scope = personal, category = housework
- AI can suggest subtask breakdowns for complex tasks

### Phase 3: Smart Features
- AI suggests priority based on context and deadlines
- AI detects duplicate or related tasks
- AI generates standup summaries in natural language
- AI can auto-categorize based on learned patterns

---

## Aesthetic / Design Principles

- **Outrun / Vaporwave / Hacker** aesthetic — vibrant magenta, cyan, purple on dark backgrounds
- **ASCII/text art only** — box-drawing characters, block elements, bracket-style icons (`[x]`, `>>>`, `◉`/`○`). No emojis anywhere in TUI or terminal output — this is a text-mode application.
- **Focus over clutter** — one task in focus at a time, minimal chrome
- **Instant feedback** — no loading spinners, no confirmation dialogs for common actions
- **Color coding**: priorities and statuses get distinct colors
  - `urgent` = red, `high` = magenta, `medium` = cyan, `low` = dim white
  - `done` = green, `in_progress` = yellow, `todo` = white

---

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| CLI (interactive) | Node.js + [Ink](https://github.com/vadimdemedes/ink) v6 + React 19 | React-based terminal UI — chosen over blessed for React mental model transfer to future web UI |
| CLI (non-interactive) | Node.js + [Commander](https://github.com/tj/commander.js) | Standard CLI argument parsing |
| MCP Server | Node.js + `@modelcontextprotocol/sdk` | Official MCP SDK |
| Storage (Phase 1) | JSON file with file locking | `~/.task-man/tasks.json` |
| Storage (Phase 2) | SQLite via `better-sqlite3` | Embedded DB, no server needed, still portable |
| Terminal styling | [chalk](https://github.com/chalk/chalk) | Colors and formatting |
| Live reload | `setInterval` polling via `useTaskStore` hook | Watch mode polls task file every 2s (configurable), no `chokidar` dep needed |
| Email delivery | [resend](https://resend.com/docs) | End-of-day report email via Resend API |

---

## Suggested Improvements & Features

These are ideas beyond what you described — take or leave any of them:

1. **Focus timer / Pomodoro**: Start a 25-minute timer on a task. Track how long you actually spend on things. Useful for metrics.

2. **Task archival**: Instead of deleting completed tasks, archive them. This preserves history for metrics and standup lookback.

3. **Recurring tasks**: "Do dishes" probably happens every day. A recurrence rule (`daily`, `weekly`, `weekdays`) could auto-create tasks.

4. **Context switching**: A `task-man focus <task-id>` command that sets your "current" task. The watch view always shows this task prominently. Claude could check what you're focused on before suggesting work.

5. **Git integration**: Automatically link tasks to branches/commits. When you run `git commit`, it could tag the commit with the active task ID.

6. **Export formats**: `task-man export --format markdown` for pasting into Slack, email, or docs.

7. **Undo**: Since we're writing to a JSON file, keep the last N states for quick undo of accidental completions or deletions.

---

## Roadmap

### Phase 1 — PoC / Foundation (current)
- [x] Project scaffolding (Node.js, TypeScript, package.json) — _completed 2026-03-15, lives in `cli/`_
- [x] Data model and JSON file storage with file locking — _completed 2026-03-15, uses `proper-lockfile` + atomic writes via tmp file rename_
- [x] Non-interactive CLI (`add`, `list`, `done`, `start`, `focus`, `unfocus`, `end-day --email`, `config`, `watch`) — _completed 2026-03-15_
- [x] MCP server with 9 tools (`task_add`, `task_list`, `task_update`, `task_complete`, `task_start`, `task_focus`, `task_unfocus`, `task_end_day`, `task_search`) — _completed 2026-03-15, lives in `mcp/`, stdio transport, shares `TaskStore` with CLI via `file:../cli` dep_
- [x] Interactive CLI with focus mode, plan mode, write mode, and metrics mode — _completed 2026-03-26, all four modes fully functional with keyboard navigation, subtask management, scope cycling_
- [x] ASCII art UI with outrun color scheme — _completed 2026-03-17, Ink (React for terminal) component library: Header, Footer, PriorityDot, StatusBadge, ProgressBar, SubtaskCheckbox, TaskRow, TaskRowExpanded, SectionDivider_
- [x] Watch mode (live-updating, non-interactive view) — _completed 2026-03-15 (basic), rebuilt 2026-03-17 with Ink — flicker-free rendering, outrun-themed double-line box frame, expanded card for top focused task, compact rows with progress bars_
- [x] `created_by` tracking for human vs AI actions — _completed 2026-03-15_
- [x] **Insights engine** with historical comparison and streak tracking — _completed 2026-03-15, 8 insight types with repeat-avoidance via `~/.task-man/insights-log.json`_
- [x] **End-of-day email** via Resend API with encouraging messages — _completed 2026-03-15, HTML email with outrun-themed inline CSS_
- [x] **Encouraging messages** — mid-day (metrics mode) and end-of-day (email/report) pools — _completed 2026-03-15, updated 2026-03-26: expanded to 15/15/12 messages across three pools, switched from random to deterministic daily pick_

#### Session 2 Deviations & Notes (2026-03-15)
- **9 tools instead of 8**: Added `task_search` (full-text case-insensitive substring search on title + description) beyond the PRD's original 8 MCP tools.
- **All MCP tools set `created_by: 'claude'`**: Since only Claude calls MCP tools, attribution is hardcoded rather than parameterized.
- **`cli/package.json` exports field added**: Enables `mcp/` to import specific modules (`store`, `types`, `config`, `report`, `render-html`, `email`) from the CLI package without monorepo tooling.
- **Stdio transport only**: No HTTP/SSE — Claude Code communicates via stdin/stdout JSON-RPC. Sufficient for local use.
- **No MCP Resources or Prompts**: Only Tools capability registered. Resources/Prompts deferred to future sessions if needed.

#### Session 3 Deviations & Notes (2026-03-17)
- **Watch mode rebuilt with Ink**: Replaced `console.clear()` + `setInterval` with Ink's React-based rendering. No more screen flicker. Component: `WatchApp.tsx`.
- **Shared UI component library created**: 9 reusable Ink components in `src/ui/shared/` designed for all future interactive modes (view, plan, write, metrics). Components use explicit string padding for box-drawing alignment rather than Ink's flex layout.
- **`useTaskStore` hook**: Wraps `TaskStore` with React state + optional `setInterval` polling. Accepts `TaskFilter` and `pollInterval` params.
- **JSX support added**: `tsconfig.json` updated with `"jsx": "react-jsx"`.
- **`watch.ts` uses `createElement`**: Kept as `.ts` (not `.tsx`) and uses `React.createElement` to avoid renaming the file.
- **No `ViewMode` reuse yet**: `WatchApp` has its own rendering logic. Will be refactored to use `<ViewMode isWatch={true} />` once ViewMode is built in a future session.

#### Session 4 Deviations & Notes (2026-03-26)
- **View Mode renamed to Focus Mode**: `f` keybinding (was `v`). All references updated. The PRD originally called it "View Mode" but "Focus Mode" better describes its purpose — showing only focused tasks.
- **Emojis removed throughout**: All emoji usage replaced with text art across metrics mode (`[x]`/`[~]`/`[ ]`), terminal reports (`[x]`/`[~]`/`[+]`/`---`/`>>>`/`--`), subtask checkboxes (`◉`/`○`), and insight prefix (`>>>`). This is a TUI — text art fits the aesthetic better.
- **Subtask checkboxes redesigned**: Changed from `☑`/`☐` (hard to read at terminal font sizes) to `◉`/`○` (radio-button style, high contrast). Done subtasks use dim color to match done title text.
- **Scope cycling changed**: `Shift+Tab` replaced with `S` key across all modes. Simpler, more discoverable.
- **Done action changed**: `Space` replaced with `D` key in focus mode. `Space` retained in plan mode for focus toggle.
- **Subtask navigation implemented**: `Tab` toggles between task and subtask nav in focus mode. Border changes from cyan to white when in subtask nav. `j`/`k` cycles subtasks, `D` toggles subtask done status.
- **Encouraging messages overhauled**: Pools expanded from 5/5/8 to 15/15/12 messages. Selection changed from random-per-render to deterministic daily pick using day-of-year index — message stays stable throughout the day.
- **Test suite expanded**: 77 tests across 8 test files (was 50 across 5). New coverage: WriteMode (9 tests), MetricsMode (7 tests), focus mode ANSI color assertions (5 tests, require `FORCE_COLOR=1`), subtask navigation (5 tests), scope cycling, footer keybinding hints. Test helper extended with `rawText()`/`rawLines()` for ANSI-preserving assertions.

#### Session 1 Deviations & Notes (2026-03-15)
- **`summary` command replaced by `end-day`**: The PRD listed `summary` as a CLI command, but the plan consolidated daily summary functionality into `end-day` (with `--date yesterday` for standup prep). No separate `summary` command was created.
- **`focus`/`unfocus` commands added**: Not originally listed in the Phase 1 CLI commands above, but specified in the Non-Interactive CLI section of the PRD. Implemented as part of Session 1.
- **Project structure**: Code lives in `cli/` subdirectory (not root) to leave room for future `mcp/`, `web/`, etc. directories.
- **No `chokidar`**: Watch mode uses `setInterval` polling instead of file-watching. Simpler, fewer deps, sufficient for the use case.
- **13 store tests**: Basic CRUD test suite via vitest covers add, persist, prefix resolve, update, query filters, scope inheritance, and date queries.

### Phase 2 — Polish & Daily Use
- [x] Subtask management in the interactive UI — _completed 2026-03-26, Tab-based subtask navigation in focus mode with j/k cycling and D to toggle done_
- [x] Quick-entry syntax parsing (`task - category`) — _completed 2026-03-26, two-phase write mode with dash-delimited category and `:` subtask prefix_
- [x] Priority and status color coding — _completed 2026-03-17 (component library), refined 2026-03-26 (text art icons, dim styling for done)_
- [ ] Daily summary / standup command
- [ ] Category management (list, rename, merge)
- [ ] Keyboard shortcut help overlay
- [ ] Task search and filtering in interactive mode

### Phase 3 — AI Integration
- [ ] AI-assisted task entry (natural language → structured task)
- [ ] AI auto-categorization based on title/description
- [ ] Smart subtask suggestions for complex tasks
- [ ] Natural language standup generation
- [ ] Claude auto-closing tasks as it completes work

### Phase 4 — Web & Multi-Device
- [ ] SQLite backend migration
- [ ] Node.js REST API server
- [ ] Web UI (React, matching the outrun aesthetic)
- [ ] Mobile-responsive design
- [ ] Multi-device sync
- [ ] Authentication

### Phase 5 — Advanced Features
- [ ] Recurring tasks
- [ ] Focus timer / time tracking
- [ ] Git integration
- [ ] Metrics dashboard (completion rates, trends, velocity)
- [ ] Export (markdown, CSV)
- [ ] Due dates and reminders
