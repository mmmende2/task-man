import { useEffect, useState } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { SERVER_PID_FILE, DEFAULT_SERVER_PORT } from '../../constants.js';
import { loadConfig } from '../../config.js';

export interface ServerStatus {
  running: boolean;
  /** The bound port. */
  port: number;
}

/**
 * Read-only check for whether a local `task-man serve` is up. The pidfile +
 * signal-0 probe is the live signal; the port is read once at mount
 * because it only changes across a server restart, which kills the
 * TUI's parent shell anyway.
 *
 * Local mode only. This hook used to also probe the remote server with its
 * own /healthz poll, which meant two independent notions of "is the store
 * reachable" — and the ping could report "up" while the query that actually
 * draws the task list was failing. Remote status now comes from
 * useTaskStore's Connection, derived from those real loads.
 */
function probePid(): boolean {
  if (!existsSync(SERVER_PID_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(SERVER_PID_FILE, 'utf-8').trim(), 10);
    if (!Number.isFinite(pid)) return false;
    process.kill(pid, 0); // throws if dead
    return true;
  } catch {
    return false;
  }
}

export function useServerStatus(): ServerStatus {
  const config = useState(() => loadConfig())[0];
  const port = useState(() => config.server?.port ?? DEFAULT_SERVER_PORT)[0];
  const [running, setRunning] = useState<boolean>(() => probePid());

  useEffect(() => {
    const id = setInterval(() => setRunning(probePid()), 5000);
    return () => clearInterval(id);
  }, []);

  return { running, port };
}
