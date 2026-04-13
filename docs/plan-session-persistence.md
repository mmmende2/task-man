# Plan: Stable Session Identity Across MCP Reconnections

## Problem

The MCP server detects its parent Claude Code session via `process.ppid` — it reads `~/.claude/sessions/{ppid}.json` to get the `sessionId`. This works on first connection, but **each MCP reconnection can spawn a new child process with a different PID**, causing `process.ppid` to resolve to a different session file (or none at all).

In practice this means:
- `task_session_color` sets the color for session A
- MCP reconnects, now detects session B
- `task_add` links the new task to session B (no color)
- The user sees no color in the TUI and has to re-run `task_session_color`

## Root Cause

`getCurrentSessionId()` in `cli/src/sessions.ts` is stateless — it re-derives the session ID from `process.ppid` on every call. The PID tree between Claude Code and the MCP server isn't guaranteed to be stable across reconnections.

## Proposed Fix

### Option A: Session ID Pinning (Recommended)

Pin the session ID on first successful detection and reuse it for the lifetime of the MCP server process.

```typescript
// mcp/src/tools.ts — at registerTools() scope
let pinnedSessionId: string | null = null;

function getStableSessionId(): string | null {
  if (pinnedSessionId) return pinnedSessionId;
  pinnedSessionId = getCurrentSessionId();
  return pinnedSessionId;
}
```

**Pros:** Minimal change, no new dependencies.
**Cons:** If the MCP server process itself restarts (not just reconnects), the pin is lost. But that's fine — a new process re-detects.

### Option B: Environment Variable Injection

If Claude Code gains support for `CLAUDE_SESSION_ID` as an env var passed to MCP child processes, session detection becomes trivial and stable. `getCurrentSessionId()` already checks for this:

```typescript
if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
```

**Pros:** Bulletproof, no heuristics.
**Cons:** Depends on Claude Code adding this feature. Track: https://github.com/anthropics/claude-code/issues (check for session env var proposals).

### Option C: Walk the PID Tree

Instead of only checking `process.ppid`, walk up the process tree to find any ancestor with a session file:

```typescript
function findAncestorSession(): string | null {
  let pid = process.ppid;
  const visited = new Set<number>();
  while (pid > 1 && !visited.has(pid)) {
    visited.add(pid);
    const file = join(SESSIONS_DIR, `${pid}.json`);
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      return data.sessionId ?? null;
    }
    // Get parent of pid (platform-specific)
    // macOS: ps -o ppid= -p <pid>
    // Linux: read /proc/<pid>/stat
    pid = getParentPid(pid);
  }
  return null;
}
```

**Pros:** Handles intermediate process layers (e.g., shell wrappers).
**Cons:** Platform-specific, more complex, slower.

## Recommendation

Start with **Option A** (session pinning). It's a 5-line change that fixes the immediate problem. Keep the `CLAUDE_SESSION_ID` env var check so Option B kicks in automatically if/when Claude Code adds it.

## Files to Change

| File | Change |
|------|--------|
| `mcp/src/tools.ts` | Replace bare `currentSessionId` with `getStableSessionId()` using pinned value |

## Testing

1. Set session color via `task_session_color`
2. Trigger MCP reconnection (e.g., switch focus away and back)
3. Add a task — verify it uses the same session ID as the color mapping
4. Verify in TUI that the task shows the correct color without re-running `task_session_color`
