import { useEffect, useRef, useState } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { SERVER_PID_FILE, DEFAULT_SERVER_PORT } from '../../constants.js';
import { loadConfig } from '../../config.js';
import { authFromConfig, RemoteStore } from '../../remote-store.js';

export interface ServerStatus {
  running: boolean;
  /** Local-mode only — the bound port. Undefined in remote mode. */
  port?: number;
  /** Remote-mode only — the configured server URL. */
  remoteUrl?: string;
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
  const config = useState(() => loadConfig())[0];
  const remote = config.client?.mode === 'remote' && config.client.remote_url;

  const port = useState(() => config.server?.port ?? DEFAULT_SERVER_PORT)[0];
  const [running, setRunning] = useState<boolean>(() => (remote ? false : probePid()));

  // Reused across polls so the cloudflared/service-token auth header
  // cache in RemoteStore persists instead of re-fetching every 5s.
  const remoteProbe = useRef<RemoteStore | null>(null);
  if (remote && !remoteProbe.current) {
    remoteProbe.current = new RemoteStore(config.client!.remote_url!, {
      authHeaders: authFromConfig(config.client!),
    });
  }

  useEffect(() => {
    if (remote) {
      const probe = remoteProbe.current!;
      probe.ping().then(setRunning);
      const id = setInterval(() => probe.ping().then(setRunning), 5000);
      return () => clearInterval(id);
    }
    const id = setInterval(() => setRunning(probePid()), 5000);
    return () => clearInterval(id);
  }, [remote]);

  return remote
    ? { running, remoteUrl: config.client!.remote_url }
    : { running, port };
}
