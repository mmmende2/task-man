# Task Man — Product Requirements Document

> This document is the product spec — what task-man is, who it's for, and how it should feel. It intentionally avoids implementation detail; the CLI reference lives in [`cli/README.md`](cli/README.md), MCP tools in [`mcp/README.md`](mcp/README.md), web UI in [`web/README.md`](web/README.md), and architectural notes in [`docs/system-map.md`](docs/system-map.md). The forward-looking hosting migration lives in [`docs/deploy-plan.md`](docs/deploy-plan.md).

---

## Vision

**Task Man** is a personal task manager for developers who live in the terminal. It replaces pen-and-paper lists with a fast, beautiful TUI that stays open in a pane — and, crucially, lets Claude read and write the same tasks through MCP so human and AI progress land in one place.

It is built around a single belief: **the job of a task manager is to get out of your way.** Every interaction is tuned to be keystrokes, not menus. Every screen leads with what you're doing now, not what you could be doing. The tool exists to serve one user through one working day, over and over, without friction.

---

## Product Principles

These are the rules that any change has to answer to.

1. **Terminal-native, AI-native.** Humans type vim keys; Claude calls MCP tools; both write the same JSON. There is no "AI mode" — AI participation is ambient.
2. **Focus over clutter.** The default screen shows what's on your plate *right now*. Everything else — backlog, metrics, planning — is one keystroke away but never on top of you.
3. **ADHD-informed, not ADHD-branded.** The design defends against time blindness, RSD, and executive-function taxation, but it reads as "nice to use," not as a medical tool. No shaming copy, no guilt framing, no "streak lost" alarms.
4. **One keystroke, one outcome.** `x` marks done. `o` creates. `f` switches to focus. No confirmation dialogs for common actions. Undo (`u`) is the safety net.
5. **The screen tells you what it is.** Outrun palette, box-drawing ASCII, single-line card when nothing is expanded, animated accents only where they *mean* something (pulsing cyan = live, magenta cursor = editing). No emojis, no spinners.
6. **Instant over impressive.** Writes are atomic, polling is cheap, latency is measured in frames. If a feature needs a loading state, we reconsider the feature.

---

## Users

| User | Interface | What they do |
|------|-----------|--------------|
| **Mario (human)** | Interactive TUI | Lives in a terminal pane; plans the day, works the focus list, logs completions, reviews metrics at day-end |
| **Claude (AI)** | MCP / non-interactive CLI | Creates tasks it picks up, marks them in-progress, closes them on completion — all attributed as `created_by: claude` |
| **Mario (mobile/web)** | Web UI on the same wifi | Reviews focused tasks and quick-captures from a phone or second laptop on the LAN. Hosted access (anywhere) tracked in [`docs/deploy-plan.md`](docs/deploy-plan.md). |

---

## The Working Day

The product is designed around one loop:

```
  morning  →  triage in Plan mode, pull 3 tasks into Focus
  day      →  work Focus mode; Claude closes its own tasks via MCP
  gaps     →  Write mode captures fast thoughts; Refine mode sweeps stale tasks
  evening  →  Metrics mode + End-of-Day email
```

Each mode is a distinct answer to "what do I need the screen to do right now."

---

## Modes

The interactive TUI has five modes. Global keys switch between them: `f` focus · `t` triage · `w` write · `m` metrics · `r` refine. `~` cycles the scope filter (all / personal / professional).

### Focus — the default

The task you are working on, large. Other focused tasks as single-line cards underneath. A quiet line at the bottom: `+ 8 more in backlog`.

**Feel:** a clean desk. If you opened task-man with nothing to do, the screen would say so. If you're mid-task, the subtasks are right there, checkbox-ready.

```
┌─ ◉ Fix auth token refresh ──────────────────────────┐
│                                                      │
│   Token expires mid-session causing 401s             │
│                                                      │
│   ◉ Investigate token lifecycle                      │
│   ◉ Add refresh logic to middleware                  │
│   ○ Write integration test                           │
│                                                      │
└──────────────────────────────────── backend ─────────┘

── ● Update API docs for v2 endpoints ────── docs ──
── ○ Review PR #847 ──────────────────────── review ──

  + 8 more in backlog
```

- Parent cards expand to a full box only when they have subtasks; otherwise they render as a single line with the category on the right — keeps the screen quiet when there's nothing to drill into.
- Priority is a colored dot, not a word. `●` magenta = high, `●` cyan = medium, `○` dim = low.
- Subtasks use radio-style `◉`/`○` — high-contrast at small terminal fonts.
- Vim keys for editing, creating, reordering, and marking done. `Tab` dives into subtask navigation.

### Triage (Plan mode) — what gets done tomorrow

The full task list grouped by first category with tree connectors. A `★` marks focused tasks; `▸` follows the cursor.

```
  CATEGORY
    ├─ ★ ● Fix auth token refresh     in_progress
    └─   ○ Review PR #847             todo

  HOUSEWORK
    ├─ ★ ○ Do dishes                  todo
    └─   ○ Water plants               todo
```

**Feel:** a flat review surface. `Space` toggles focus. `j`/`k` skips over category headers. When you try to focus more than the soft cap (default 3), the mode asks — it doesn't block, but it makes you name the choice.

### Write — capture & review

Two sub-modes inside one screen. **Capture** (default) is a single input line pinned near the bottom with live flag preview. The top pane shows this session's tasks grouped by first category, subtasks indented — they're fresh in your head, so we show them (the deliberate asymmetry with Triage, which stays flat). Category autocomplete surfaces existing categories as ghost text (`Tab` accepts); near-miss typos get a "Did you mean?" line — advisory, never auto-rewritten. A chip (`session · today · all`) bounds what's visible.

**Review** is `Esc` away: a vim-nav layer over the same entries. `j`/`k` moves, `c`/`p`/`s`/`f`/`x`/`cc`/`dd` edit per-entry, `u` undoes, `T` cycles the time filter, `i` returns to Capture. Reuses the same edit primitives as Focus and Plan.

**Feel:** a capture prompt that never pushes back. Type `clean dishes -c housework` and move on. Type `: load dishwasher` to attach a subtask to the last thing you created. When you realize five entries in that they all belong under one category, `Esc` + `c` fixes it without leaving the mode.

### Metrics — the day's shape

Hero metric: **Done today: N** (parent tasks). A progress list with `[x]` / `[~]` / `[ ]` markers and `[you]` / `[claude]` attribution. A data-driven insight (`>>> You beat yesterday by 2`). A deterministic encouraging message. You can edit the date to look back at any prior day.

**Feel:** retrospective, not scoreboard. The insight is chosen from a pool that is always affirmative or neutral — no shaming, no streak panic. A pulsing cyan `◉` marks tasks where every subtask also closed: a quiet reward, not a medal.

### Refine — rapid-fire triage

A deliberate interrupt: a pulsing double-bordered card asking one question at a time — *Scope? Priority? How long? Vibe? Pull into focus?* — for tasks missing metadata, or created by Claude, or stuck in todo for a week.

**Feel:** a card-flip machine. One keystroke per answer. `s` skips a question, `S` skips the task, `u` undoes the last answer, `esc` bails. When the queue is empty: `Nothing needs refine. Clean slate.`

---

## Data Model

Tasks are the only first-class object. Each task carries:

- **Title** and optional **description**.
- **Status**: `todo` / `in_progress` / `done`.
- **Priority**: `low` / `medium` / `high`.
- **Scope**: `personal` or `professional`. Top-level partition, exactly one per task. The CLI and UI filter by scope everywhere.
- **Categories**: freeform tags, many per task. The product treats categories as the organizing layer — parent tasks are for real parent/child relationships, not pseudo-folders.
- **Parent**: subtasks inherit their parent's scope by default; categories can diverge.
- **Focused**: `true` = on your plate now. `false` = backlog. New tasks default to backlog; Focus mode only shows focused tasks.
- **Attribution** (`created_by`): `human` or `claude`. Drives the metrics attribution and the insight engine's AI-collaboration line.
- **ADHD metadata** (optional): `time_estimate` (`<5m` / `20m` / `45m` / `>1h` / `>3h`) and `vibe` (`love` / `ok` / `dread`). Populated by Refine mode. Intended to feed future prioritization and sequencing.
- **Session ID**: the Claude Code session that created the task, when available. Used to tint session-authored tasks with a per-session color so you can see "what Claude did in this conversation" at a glance.
- Timestamps (`created_at`, `updated_at`, `completed_at`) are automatic.

### Design calls

- **Scope is a partition, categories are tags.** One scope, many categories. Historically the project drifted toward using parent tasks as pseudo-categories — that's a dead-end and Refine + Write mode v2 nudge away from it.
- **Focused vs. backlog is a state, not a view.** You pull tasks into focus in Plan/Refine mode and work them in Focus mode. The number lives on the task itself, not in a separate queue.
- **AI attribution is always on.** Metrics, end-of-day emails, and insights can all call out human vs. Claude progress. This is the point of the integration.

---

## MCP, Web, and the Operational CLI

Everything the TUI does is also available as:

- **Operational CLI only** — `task-man watch`, `config`, `serve`, `login` (plus the default interactive TUI). The task-facing CRUD/report subcommands were retired 2026-07 (humans → TUI/web, Claude → MCP; see Phase 5). Reference in [`cli/README.md`](cli/README.md).
- **MCP server** — exposes the same actions to Claude as tools: add, list, get, subtasks, update, delete, complete, start, focus, unfocus, stats, categories, refine-queue, prioritize, end-day, search, session-color. Stdio transport, same JSON store, all mutations attributed as `created_by: claude`. Full reference in [`mcp/README.md`](mcp/README.md).
- **Web** — `task-man serve` starts a Hono server with a mobile-first React SPA. Local-only by default; `--bind 0.0.0.0` exposes it on the LAN (no auth of its own — in production Cloudflare Access gates the hostname). Scope: Focus, Quick Capture, Backlog, and Metrics. Plan/Refine stay TUI-only. See [`web/README.md`](web/README.md).

All paths write to the same file. Focus mode reflects AI and web progress in real time.

---

## End-of-Day Report

Invoked via `task-man end-day`, the `e` key in Metrics mode, the `/end-day` Claude Code skill, or the `task_end_day` MCP tool. Runs before you close the laptop, or with `--date yesterday` as standup prep.

Sections: completed today · in-progress (with subtask progress bars) · started today · Tomorrow's Focus (capped at 5) · stats with human/Claude split · an insight · an encouraging message.

Terminal rendering is the source of truth; the email (Resend API) is the same content in outrun-themed HTML. Config lives in `~/.task-man/config.json` and is editable via `task-man config <key> <value>`.

---

## Insights Engine

Every report pulls one insight from a pool of seven types: vs. yesterday, personal best, streak, scope balance, AI collaboration, velocity trend, focus ratio. Selection prefers records → comparisons → neutral observations, and avoids repeating the same type on consecutive days. All insights are affirmative or neutral — never shaming.

Everything computes from existing task fields; no separate metrics store.

---

## Encouraging Messages

Plain text, no emojis. Three pools (mid-day high progress, mid-day low progress, end-of-day) with ~15 messages each. The day's pick is deterministic on day-of-year so it stays stable across a day, rather than re-rolling every render.

Low-progress messages are carefully written to be shame-free. This is a load-bearing detail of the ADHD stance.

---

## Aesthetic

- **Outrun / vaporwave** — magenta, cyan, purple on dark. Pulsing cyan for live/animated elements. Magenta block cursor in edit mode.
- **ASCII only** — box-drawing, block elements, bracket icons (`[x]`, `>>>`, `◉`/`○`). No emojis anywhere, including commits and error messages.
- **Single-line by default, expand when it matters.** Focus mode's first card expands when it has subtasks; otherwise everything is a row.
- **Color carries meaning.** Priority color = urgency. Status color = done/in-progress/todo. Session color = which Claude conversation created the task. Don't use color as decoration.

---

## Storage

- **Today**: single JSON file at `~/.task-man/tasks.json` with file locking and atomic rename on write. Portable, diffable, shared in-process by CLI, TUI, and MCP. A REST API (Hono) sits in front of the same file for the web UI.
- **Next**: hosted server on a single droplet behind Cloudflare Access, with the TUI and MCP becoming thin clients of that API (see [`docs/deploy-plan.md`](docs/deploy-plan.md)). Local-file mode is retained as a fallback.
- **Later (open)**: SQLite once concurrent client traffic warrants it. Not committed.

JSON is deliberate: a single plain-text store means I can edit it by hand in an emergency, rsync it between machines, and reason about it without tooling.

---

## Roadmap

### Phase 1 — Foundation ✓
Data model, JSON storage, non-interactive CLI, MCP server, interactive TUI (focus/plan/write/metrics), watch mode, end-of-day email, insights, encouraging messages.

### Phase 2 — Polish & Daily Use ✓
- [x] Subtasks in the TUI
- [x] Quick-entry syntax (`-p`/`-c`/`-s`/`-d`/`-f`, `:` subtask prefix)
- [x] Priority + status color coding
- [x] Shame-free copy, focus guardrails, Tomorrow's Focus
- [x] Task search (`/`)
- [x] Vim keybindings (`dd`/`p`, `i`/`A`/`cc`, `o`/`O`, `x`, `u`)
- [x] Category tree view in triage mode
- [x] Single-line expanded focus card
- [x] Session-color integration with Claude Code
- [x] Refine mode (standalone rapid-fire triage)
- [x] `time_estimate` and `vibe` metadata
- [x] Write mode v2 (Capture + Review sub-modes, category autocomplete)
- [ ] Inline spell-fix suggestions in Write Capture
- [ ] Category management (list, rename, merge)
- [ ] Keyboard shortcut help overlay

### Phase 3 — AI Integration
- [x] AI-assisted prioritization via `task_prioritize` MCP tool (uses `time_estimate` + `vibe`; AI proposes, user approves via `task_update`)
- [x] Claude auto-closing tasks as it completes work (via `task_complete` / `task_update`)
- [ ] AI-assisted task entry (natural language → structured task)
- [ ] AI auto-categorization for Refine mode
- [ ] Smart subtask suggestions
- [ ] Natural-language standup generation

### Phase 4 — LAN Web ✓
- [x] Hono REST API server (`task-man serve`)
- [x] Vite/React mobile-first web UI (Focus + Quick Capture)
- [x] 4-digit PIN auth + signed session cookie *(removed in Phase 5 — Cloudflare Access replaces it)*
- [x] PWA shell (Add to Home Screen)

### Phase 5 — Hosted & Multi-Device
Detailed in [`docs/deploy-plan.md`](docs/deploy-plan.md); manual infra steps in [`docs/phase2-manual-setup-guide.md`](docs/phase2-manual-setup-guide.md).
- [x] TUI and MCP become remote clients (HTTP-backed `Store` with local-file fallback)
- [x] PIN dropped; server verifies the Cloudflare Access JWT at the origin (`CF_ACCESS_*` env)
- [ ] Single droplet on DigitalOcean (Docker + Cloudflare Tunnel) — Dockerfile/compose ready, not deployed
- [x] Authorization layer — per-identity namespaces enforced server-side (scoped-store) + zod request validation; see docs/authorization-plan.md
- [ ] Nightly backups to DO Spaces
- [ ] SQLite migration (optional, when JSON contention warrants)
- [x] Retire the task-facing CLI (`add`, `list`, `done`, `start`, `focus`, `unfocus`,
  `session-refocus`, `end-day`) — removed 2026-07-04. Humans use the TUI/web, Claude
  uses MCP (`task_end_day` covers reports/email); the commands only ever wrote the
  local file, bypassing remote mode. Operational commands stay: interactive TUI,
  `watch`, `serve`, `login`, `config`.

### Phase 6 — Advanced
- [ ] Recurring tasks
- [ ] Focus timer / Pomodoro
- [ ] Git integration (link tasks to branches/commits)
- [ ] Trend dashboard (velocity, per-category)
- [ ] Export (markdown, CSV)
- [ ] Due dates and reminders
- [ ] Task archival for long-range metrics lookback
