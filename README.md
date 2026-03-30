# task-man

Personal task manager for developers who live in the terminal. Designed with focus management in mind — pull tasks into a small working set, plan in a flat list, and let Claude help via MCP.

## Installation

### Prerequisites

- Node.js >= 18
- npm

### Install globally from source

```bash
git clone <repo-url>
cd task-man

# Build and link the CLI
cd cli
npm install
npm run build
npm link

# Build and link the MCP server (optional)
cd ../mcp
npm install
npm run build
npm link
```

Verify:

```bash
task-man --version
```

### If you use nvm

`npm link` installs into whichever Node version is active. If you switch versions, the binary won't be on your PATH. Two options:

**Option A** — Link under your default version:

```bash
nvm use default
cd cli && npm link
cd ../mcp && npm link
```

**Option B** — Add the link target to your shell profile so it persists across versions:

```bash
# Find where npm linked it
npm -g root  # e.g. /Users/you/.nvm/versions/node/v22.0.0/lib/node_modules

# Add to .zshrc / .bashrc
export PATH="/Users/you/.nvm/versions/node/v22.0.0/bin:$PATH"
```

### After rebuilding

If you change source code, rebuild before the global command picks it up:

```bash
cd cli && npm run build
```

## Usage

### Quick start

```bash
# Add a task
task-man add "Set up CI pipeline" -p high -s professional

# Add a subtask
task-man add "Configure GitHub Actions" --parent <id>

# Focus a task (pull into today's working set)
task-man focus <id>

# Mark done
task-man done <id>

# Launch interactive mode
task-man
```

### Interactive mode

Running `task-man` with no arguments opens the interactive TUI. It has four modes:

| Key | Mode | Purpose |
|-----|------|---------|
| `f` | Focus | Work through your focused tasks |
| `p` | Plan | Organize focused + backlog lists |
| `w` | Write | Quick-add tasks from a prompt |
| `m` | Metrics | View stats and generate end-of-day reports |

Press `S` in any mode to cycle the scope filter: all / personal / professional.

#### Vim keybindings

The interactive mode uses vim-style keybindings:

**Navigation**

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `Tab` | Toggle between task and subtask navigation (focus mode) |

**Editing**

| Key | Action |
|-----|--------|
| `i` | Edit task title (cursor at start) |
| `A` | Edit task title (cursor at end) |
| `cc` | Clear title and edit from scratch |
| `o` | Create new task below |
| `O` | Create new task above |
| `Esc` / `Enter` | Save edit |

**Actions**

| Key | Action |
|-----|--------|
| `x` | Toggle done / todo |
| `Space` | Toggle focused / backlog (plan mode) |
| `dd` | Cut task (enter holding mode) |
| `p` | Paste below (in holding mode) |
| `P` | Paste above (in holding mode) |
| `u` | Undo last action |
| `/` | Search / filter tasks |

`dd`/`p` reordering is only available in plan mode. Cut a task, navigate to the target position, then paste.

### Watch mode

```bash
task-man watch           # Refresh every 2s
task-man watch -i 5000   # Refresh every 5s
```

Displays focused tasks with live updates. Useful as a sidebar.

## CLI Reference

### `task-man add <title>`

Create a new task.

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --priority <level>` | `low`, `medium`, `high` | `high` |
| `-s, --scope <scope>` | `personal`, `professional` | `personal` |
| `-c, --category <name>` | Category tag (repeatable) | — |
| `--parent <id>` | Parent task ID (creates subtask) | — |
| `-d, --description <text>` | Description | — |
| `--created-by <who>` | `human`, `claude` | `human` |
| `-f, --focused` | Add directly to focus list | backlog |

```bash
task-man add "Write tests" -p medium -c testing -s professional
task-man add "Unit tests for store" --parent abc12
```

### `task-man list`

List tasks with optional filters.

| Flag | Description |
|------|-------------|
| `-s, --scope <scope>` | Filter by `personal` or `professional` |
| `--status <status>` | Filter by `todo`, `in_progress`, `done` |
| `--focused` | Show only focused tasks |
| `--backlog` | Show only backlog tasks |
| `-c, --category <name>` | Filter by category |

```bash
task-man list --focused
task-man list -s professional --status todo
```

### `task-man done <id>`

Mark a task as done. Accepts full ID or unambiguous prefix.

```bash
task-man done abc12
```

### `task-man start <id>`

Mark a task as in_progress.

```bash
task-man start abc12
```

### `task-man focus <id>`

Pull a task into your focused working set.

```bash
task-man focus abc12
```

### `task-man unfocus <id>`

Send a task back to the backlog.

```bash
task-man unfocus abc12
```

### `task-man config <key> [value]`

Get or set configuration values. Uses dot notation.

```bash
task-man config focus.maxFocused        # Read
task-man config focus.maxFocused 5      # Write
task-man config email.to me@example.com
```

**Config keys:**

| Key | Description | Default |
|-----|-------------|---------|
| `focus.maxFocused` | Max tasks in focus list (guardrail) | `3` |
| `email.to` | Email address for end-of-day reports | — |
| `email.resendApiKey` | Resend API key for email delivery | — |
| `email.autoPromptAfter` | Time to prompt for end-of-day | `17:00` |

Config is stored at `~/.task-man/config.json`.

### `task-man end-day`

Generate an end-of-day report.

| Flag | Description |
|------|-------------|
| `--date <date>` | Date in `YYYY-MM-DD` or `yesterday` |
| `--email` | Send report via email (requires config) |

```bash
task-man end-day
task-man end-day --date yesterday --email
```

### `task-man watch`

Live-updating display of focused tasks.

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --interval <ms>` | Poll interval in milliseconds | `2000` |

### `task-man` (no args)

Launch the interactive TUI.

## Data storage

All data lives in `~/.task-man/`:

| File | Contents |
|------|----------|
| `tasks.json` | Task database (JSON array) |
| `config.json` | User configuration |
| `insights-log.json` | Historical insights for reports |

Task IDs are UUIDs. Most commands accept an unambiguous prefix (e.g., `abc12` instead of `abc12def-...`).

## MCP Server

The MCP server lets Claude Code manage your tasks directly. It uses the same data store as the CLI.

### Setup

Add to your Claude Code MCP config (`.claude/settings.json` or equivalent):

```json
{
  "mcpServers": {
    "task-man": {
      "command": "task-man-mcp"
    }
  }
}
```

If installed via `npm link`, make sure the linked binary is on the PATH that Claude Code uses.

### MCP Tool Reference

#### `task_add`

Create a new task. Automatically sets `created_by: 'claude'`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Task title |
| `priority` | `low` / `medium` / `high` | no | Task priority |
| `scope` | `personal` / `professional` | no | Task scope |
| `categories` | string[] | no | Category tags |
| `parent_id` | string | no | Parent task ID (prefix OK) |
| `description` | string | no | Task description |

#### `task_list`

List tasks with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | `personal` / `professional` | no | Filter by scope |
| `status` | `todo` / `in_progress` / `done` | no | Filter by status |
| `focused` | boolean | no | Filter by focused state |
| `category` | string | no | Filter by category |
| `limit` | number | no | Max tasks to return |

#### `task_update`

Update one or more fields on a task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |
| `title` | string | no | New title |
| `status` | `todo` / `in_progress` / `done` | no | New status |
| `priority` | `low` / `medium` / `high` | no | New priority |
| `scope` | `personal` / `professional` | no | New scope |
| `categories` | string[] | no | New categories |
| `description` | string | no | New description |

#### `task_complete`

Mark a task as done.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |

#### `task_start`

Mark a task as in_progress.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |

#### `task_focus`

Pull a task into the focused working set.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |

#### `task_unfocus`

Send a task back to the backlog.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Task ID (prefix OK) |

#### `task_end_day`

Generate an end-of-day report.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | string | no | `YYYY-MM-DD` or `yesterday` |
| `email` | boolean | no | Send report via email |

#### `task_search`

Full-text search across task titles and descriptions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (case-insensitive substring) |
