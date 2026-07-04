# task-man MCP server

MCP server for Claude Code. Lets Claude create, update, focus, and report on tasks in the same `~/.task-man/` store the TUI uses.

> **The code lives in the main package** — `cli/src/mcp/`, shipped as the
> `task-man-mcp` bin of the `task-man` npm package (merged 2026-07; see
> [`docs/packaging-plan.md`](../docs/packaging-plan.md)). This directory
> holds only this reference.

Uses the store and handlers directly via `getStore()`: in the default local mode it operates on `~/.task-man/tasks.json` in-process; in remote mode (`client.mode = remote` in `~/.task-man/config.json`) the same tools talk to the hosted server over HTTPS, authenticating with a Cloudflare Access service token (`client.service_token_id` / `client.service_token_secret`). Tool signatures are identical in both modes.

## Install

One package provides both bins:

```bash
cd cli && npm install && npm run build && npm link   # from source
# or, once published:  npm install -g task-man
```

## Configure Claude Code

```bash
claude mcp add task-man -- task-man-mcp
# or, once published, with no install at all:
claude mcp add task-man -- npx -y --package=task-man task-man-mcp
```

If the bin came from `npm link`, make sure it's on the PATH Claude Code uses (see the [nvm note in `cli/README.md`](../cli/README.md#if-you-use-nvm)).

## Conventions

- All mutations are attributed as `created_by: 'claude'` and tagged with the current Claude Code session ID when one is detectable (`CLAUDE_SESSION_ID` env var).
- Most ID parameters accept an unambiguous prefix.
- Read tools that return lists prefix the JSON with a summary line (`Found N tasks (...)`) so the model has a quick header.

## Tool reference

### `task_add`

Create a new task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Task title |
| `priority` | `low` / `medium` / `high` | no | Default `medium` |
| `scope` | `personal` / `professional` | no | |
| `categories` | string[] | no | |
| `parent_id` | string | no | Parent task ID (prefix OK) — creates a subtask |
| `description` | string | no | |
| `focused` | boolean | no | Add directly to focus list (default: backlog) |
| `time_estimate` | `<5m` / `20m` / `45m` / `>1h` / `>3h` | no | |
| `vibe` | `love` / `ok` / `dread` | no | |

### `task_list`

List tasks with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `personal` / `professional` | no | |
| `status` | `todo` / `in_progress` / `done` | no | |
| `focused` | boolean | no | |
| `category` | string | no | |
| `parent_id` | string | no | Prefix OK. Use `"null"` for top-level only. |
| `include_done` | boolean | no | Default true (unless `status` is set) |
| `sort` | `priority` / `created_at` / `created_at_desc` / `updated_at` | no | |
| `limit` | number | no | |

### `task_get`

Fetch a single task, with its subtasks inlined under `subtasks`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |

### `task_subtasks`

List subtasks of a parent task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent_id` | string | yes | Prefix OK |

### `task_update`

Update fields on a task. Returns `{ diff, task }` so the AI can narrate what changed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Prefix OK |
| `title` | string | no | |
| `status` | `todo` / `in_progress` / `done` | no | |
| `priority` | `low` / `medium` / `high` | no | |
| `scope` | `personal` / `professional` | no | |
| `categories` | string[] | no | Replaces existing |
| `description` | string | no | |
| `focused` | boolean | no | |
| `time_estimate` | `<5m` / `20m` / `45m` / `>1h` / `>3h` / null | no | null clears |
| `vibe` | `love` / `ok` / `dread` / null | no | null clears |
| `parent_id` | string / null | no | null promotes to top-level |
| `completed_at` | string / null | no | ISO timestamp |
| `session_id` | string / null | no | |

### `task_delete`

Delete a task permanently. Subtasks are not auto-deleted; their `parent_id` becomes dangling and the response notes the count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Prefix OK |
| `confirm` | boolean | yes | Must be `true` |

### `task_complete` / `task_start`

Mark a task as `done` / `in_progress`. `task_start` also tags the task with the current session.

| Parameter | Type | Required |
|-----------|------|----------|
| `id` | string | yes |

### `task_focus` / `task_unfocus`

Move a task into / out of the focused working set. `task_focus` also tags with the current session.

| Parameter | Type | Required |
|-----------|------|----------|
| `id` | string | yes |

### `task_stats`

Snapshot of the current plate: `total`, `focused`, `in_progress`, `todo_focused`, `backlog`, `completed_today`, `subtasks_total`, `subtasks_done_today`. No parameters.

### `task_categories`

List known categories with usage counts, sorted by count descending. Useful for auto-categorization. No parameters.

### `task_refine_queue`

List tasks that need refinement — missing scope/time estimate/vibe, created by Claude, or stuck in `todo` >7 days. Each entry includes a `reasons` array. Mirrors the TUI's Refine mode. No parameters.

### `task_prioritize`

Return the active task list with prioritization context for the AI to reason over. Returns `{ instruction, user_context, scope, task_count, tasks }`. The model proposes changes with reasons; it must call `task_update` to apply accepted ones (never auto-applied).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `personal` / `professional` / `all` | no | Default `all` |
| `context` | string | no | e.g. "demo on Friday" |

### `task_end_day`

Generate an end-of-day report.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | string | no | `YYYY-MM-DD` or `yesterday` |
| `email` | boolean | no | Send via email |
| `format` | `text` / `json` | no | Default `text` |

### `task_search`

Full-text search across titles and descriptions, with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Case-insensitive substring |
| `scope` | `personal` / `professional` | no | |
| `status` | `todo` / `in_progress` / `done` | no | |
| `include_done` | boolean | no | Default true (unless `status` is set) |

### `task_session_color`

Set the terminal color for the current Claude Code session. Matches the session tint used across the TUI.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `color` | `cyan` / `magenta` / `purple` / `yellow` | yes | |

## Development

```bash
cd mcp
npm run build       # tsc → build/
npm run watch       # tsc --watch, if defined
```

Because the MCP server imports from the CLI as `task-man/*`, rebuild the CLI (`cd cli && npm run build`) when you change shared modules.

## Future

The `Store` interface swap has landed — the MCP server follows the TUI's local/remote mode from config. What remains before remote mode is usable end-to-end is the hosting itself (droplet + Cloudflare Tunnel/Access): see [`docs/deploy-plan.md`](../docs/deploy-plan.md) and [`docs/phase2-manual-setup-guide.md`](../docs/phase2-manual-setup-guide.md).
