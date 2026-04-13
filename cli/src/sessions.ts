import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * Detect the current Claude Code session ID.
 * Used by the MCP server at tool-call time.
 */
export function getCurrentSessionId(): string | null {
  // 1. Check env var (future-proofing — Claude Code may add this)
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;

  // 2. MCP servers are direct children of Claude Code (stdio transport),
  //    so process.ppid is the Claude Code PID → matches session filename
  const sessionFile = join(SESSIONS_DIR, `${process.ppid}.json`);
  if (existsSync(sessionFile)) {
    try {
      const data: SessionFile = JSON.parse(readFileSync(sessionFile, 'utf-8'));
      return data.sessionId ?? null;
    } catch {
      return null;
    }
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
