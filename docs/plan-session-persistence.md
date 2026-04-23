# Plan: Bulletproof Session Identity for the MCP Server

## Context

The MCP server needs a stable `sessionId` for the lifetime of a process so that state set by one tool call (e.g. `task_session_color`) is visible to later tool calls (`task_add`, `task_list`) in the same Claude Code session.

Today, `cli/src/sessions.ts::getCurrentSessionId()` is called on every tool call and tries to resolve the session by walking up `process.ppid` up to 5 levels looking for `~/.claude/sessions/{pid}.json`. In the user's environment (Node installed via **nvm**, occasionally two Claude Code sessions running in the same cwd), this walk is unreliable:

- The nvm shim adds shell/node wrappers between the MCP process and the Claude Code process, so the 5-level walk can miss or bail early.
- If any intermediate PID happens to own an unrelated session file (stale or otherwise), the walk returns the **wrong** sessionId and stops.
- The previously-proposed "Option A" (pin first result) makes this worse: a `null` or wrong first hit gets frozen for the process lifetime.
- `CLAUDE_ENV_FILE` + `SessionStart` hook is **not documented to propagate env vars into MCP child processes**, so that route isn't bulletproof either.
- The fix must be self-contained in the MCP server — no external hook to maintain.

Goal: resolve the parent Claude Code session reliably on MCP startup even through nvm wrappers, correctly disambiguate when two Claudes share a cwd, and stop re-detecting per tool call.

## Approach

Replace the shallow PID-ancestor walk with a two-stage resolver that runs **once** at MCP startup, pins the result, and uses it for the process lifetime:

**Stage 1 — Full ancestor set ∩ session-file PIDs (authoritative).**
Collect our full process ancestry (walk `ps -o ppid=` up to depth ~20, not 5), then scan every file in `~/.claude/sessions/*.json` and return the one whose `pid` is in our ancestor set. This is the only way to disambiguate when multiple Claudes run with the same cwd, because PID ancestry uniquely names *our* parent. Building the ancestor set first (instead of short-circuiting on the first session file found along the way) prevents an intermediate PID with an unrelated/stale session file from poisoning the result.

**Stage 2 — Realpath-normalized cwd + live-PID fallback.**
If Stage 1 finds nothing (e.g. unusual launch path, ancestry lost), fall back to: among session files whose `cwd` (realpath-normalized) matches `process.cwd()` and whose `pid` passes `process.kill(pid, 0)`, pick the one with the largest `updatedAt`. This is weaker (can pick wrong in same-cwd-multi-session), but is only reached when Stage 1 failed entirely — better than returning `null`.

**Keep `CLAUDE_SESSION_ID` env var as the highest-priority shortcut** so future Claude Code versions can hand us the answer directly.

**Pin at MCP init, not at first tool call.** The first tool call may fire well after init, by which point intermediate shell processes (nvm wrappers) may have exited — ancestry becomes unreadable via `ps`. Running detection synchronously during `mcp/src/index.ts` startup happens while the spawn chain is still intact.

**Handle MCP reconnection correctly.** When Claude Code respawns the MCP server, `mcp/src/index.ts` runs again and re-detects — no stale pin, no retry logic needed.

## Files to Change

### `cli/src/sessions.ts`
Rewrite `getCurrentSessionId()` with the two-stage resolver above:
1. `process.env.CLAUDE_SESSION_ID` shortcut (preserve).
2. Build ancestor PID set via `getParentPid` loop up to depth ~20.
3. `readdirSync(SESSIONS_DIR)` once; return the first session file whose `pid` is in the ancestor set.
4. Fallback: filter session files by realpath-normalized `cwd` match and live PID (`process.kill(pid, 0)`); return the one with max `updatedAt`.
5. Use `fs.realpathSync` on both sides of the cwd comparison to handle symlinks (e.g. `/Users/mario` vs `/private/Users/mario` on macOS, or project-local symlinks).

Keep `isSessionActive()` and `getSessionHexColor()` untouched — they already work correctly.

### `mcp/src/index.ts`
Call the resolver once at startup, before `server.connect(transport)`, and pass the pinned value into `registerTools`:
```ts
const pinnedSessionId = getCurrentSessionId();
registerTools(server, pinnedSessionId);
```

### `mcp/src/tools.ts`
- Change `registerTools(server)` signature to `registerTools(server, pinnedSessionId: string | null)`.
- Remove every in-tool call to `getCurrentSessionId()` (currently at lines ~83, 119, 301, 315, 573) and read from the pinned closure instead.
- Do **not** remove the `getCurrentSessionId` import from `cli/src/sessions.ts` — it's still used by the CLI (`cli/src/commands/session-refocus.ts`, UI modes).

## Critical Files

| File | Role |
|------|------|
| `cli/src/sessions.ts` | `getCurrentSessionId()` — rewrite with two-stage resolver |
| `mcp/src/index.ts` | Call resolver at startup, pin result, pass to `registerTools` |
| `mcp/src/tools.ts` | Accept pinned id, drop per-call detection |
| `cli/src/commands/session-refocus.ts` | Unchanged — continues to call `getCurrentSessionId()` at CLI-time (fresh ancestry) |
| `cli/src/ui/modes/*.tsx` | Unchanged — `useMemo(() => getCurrentSessionId(), [])` still one-shot at mount |

## Verification

**Build & type-check**
- `cd cli && npm run build`
- `cd mcp && npm run build`

**Scenario 1 — nvm PID chain (the failing case today):**
1. Confirm Claude Code is running under nvm (`which node` shows an nvm path).
2. `task_session_color cyan` — note the sessionId logged.
3. Force MCP reconnect (toggle the MCP server in Claude Code's settings, or `/mcp` reconnect).
4. `task_add "test task"` — verify it stores the **same** sessionId as step 2.
5. Open the TUI (`task-man`) — the new task should render with the cyan dot immediately, no need to re-run `task_session_color`.

**Scenario 2 — two Claudes, same cwd:**
1. Open two terminal windows, both `cd /Users/mario/claude-projects/task-man`, run `claude` in each.
2. In session A: `task_session_color cyan`. In session B: `task_session_color magenta`.
3. In session A: `task_add "task A"`. In session B: `task_add "task B"`.
4. TUI: task A should be cyan, task B should be magenta. Previously, cwd-alone matching would have mixed them up; ancestor-set matching disambiguates.

**Scenario 3 — stale session file (regression check):**
1. Manually create a bogus `~/.claude/sessions/1.json` with an arbitrary `sessionId`.
2. Start Claude Code + task-man MCP normally.
3. Verify MCP still resolves to the real session (ancestor-set check must not match PID 1).
4. Delete the bogus file.

**Scenario 4 — baseline:**
1. Single Claude, no nvm wrappers (or with them): `task_add`, `task_list`, `task_session_color` all agree on sessionId.
2. Existing CLI paths (`task-man` TUI, `session-refocus`) still correctly identify the current session — they call `getCurrentSessionId()` directly and benefit from the same resolver improvement.
