import { useEffect, useState } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { SERVER_PID_FILE, DEFAULT_SERVER_PORT } from '../../constants.js';
import { loadConfig } from '../../config.js';

export interface ServerStatus {
  running: boolean;
  port: number;
}

/**
 * Read-only check for whether `task-man serve` is up. The pidfile +
 * signal-0 probe is the live signal; the port is read once at mount
 * because it only changes across a server restart, which kills the
 * TUI's parent shell anyway.
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
  const [port] = useState(() => loadConfig().server?.port ?? DEFAULT_SERVER_PORT);
  const [running, setRunning] = useState<boolean>(() => probePid());
  useEffect(() => {
    const id = setInterval(() => setRunning(probePid()), 5000);
    return () => clearInterval(id);
  }, []);
  return { running, port };
}
