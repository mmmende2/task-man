---
name: session-color
description: Set the task-man color for the current Claude Code session so linked tasks show a matching dot in the TUI. Use when the user runs /session-color <color> or asks to color/tag this session.
---

Set this Claude Code session's color in task-man. Tasks linked to this session
(created via `task_add`, or claimed via `task_start`/`task_focus`) show a dot
in this color in the task-man TUI.

## Steps

1. Validate the argument (`$ARGUMENTS`) is one of: `red`, `blue`, `green`,
   `yellow`, `purple`, `orange`, `pink`, `cyan`. If it is missing or invalid,
   list the valid colors and stop.
2. Call the `task_session_color` MCP tool with that color.
3. Tell the user to run `/color <color>` themselves so their prompt bar
   matches — you cannot run built-in slash commands on their behalf.
4. Optionally, call `task_list` and mention any tasks whose
   `is_current_session` annotation is true, so the user knows what this
   session is already linked to.

If `task_session_color` reports no active session, the MCP server could not
detect the Claude Code session (it walks parent PIDs to
`~/.claude/sessions/`). Report that plainly rather than retrying.
