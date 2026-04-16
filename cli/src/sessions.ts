import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SESSION_COLORS } from './constants.js';
import type { SessionColor, TaskManConfig } from './types.js';

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions');

interface SessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
}

/**
 * Read the parent PID of a given PID from the OS.
 * Returns null if the process doesn't exist or can't be read.
 */
function getParentPid(pid: number): number | null {
  try {
    const output = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf-8' });
    const ppid = parseInt(output.trim(), 10);
    return Number.isNaN(ppid) || ppid <= 1 ? null : ppid;
  } catch {
    return null;
  }
}

/**
 * Detect the current Claude Code session ID.
 * Used by the MCP server at tool-call time.
 */
export function getCurrentSessionId(): string | null {
  // 1. Check env var (future-proofing — Claude Code may add this)
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;

  // 2. Walk up the process tree looking for a PID that has a session file.
  //    MCP servers may be wrapped in intermediate shells (e.g. nvm/bash),
  //    so process.ppid isn't always the Claude Code PID directly.
  let pid: number | null = process.ppid;
  const maxDepth = 5;
  for (let i = 0; i < maxDepth && pid !== null; i++) {
    const sessionFile = join(SESSIONS_DIR, `${pid}.json`);
    if (existsSync(sessionFile)) {
      try {
        const data: SessionFile = JSON.parse(readFileSync(sessionFile, 'utf-8'));
        return data.sessionId ?? null;
      } catch {
        return null;
      }
    }
    pid = getParentPid(pid);
  }
  return null;
}

/**
 * Check if a session is currently active (PID still running).
 * Reads ~/.claude/sessions/*.json to find the file with matching sessionId,
 * then verifies the PID is alive via signal 0.
 */
export function isSessionActive(sessionId: string): boolean {
  if (!existsSync(SESSIONS_DIR)) return false;

  try {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data: SessionFile = JSON.parse(
          readFileSync(join(SESSIONS_DIR, file), 'utf-8'),
        );
        if (data.sessionId === sessionId) {
          // Check if the PID is still running (signal 0 = test only)
          try {
            process.kill(data.pid, 0);
            return true;
          } catch {
            return false; // PID not running
          }
        }
      } catch {
        // Skip malformed session files
      }
    }
  } catch {
    // Sessions dir unreadable
  }
  return false;
}

/**
 * Resolve a session ID to its hex color value via config lookup.
 */
export function getSessionHexColor(
  sessionId: string | null | undefined,
  config: TaskManConfig,
): string | null {
  if (!sessionId) return null;
  const colorName = config.sessions?.[sessionId] as SessionColor | undefined;
  return colorName ? SESSION_COLORS[colorName] ?? null : null;
}
