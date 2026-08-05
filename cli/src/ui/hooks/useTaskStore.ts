import { useState, useCallback, useEffect } from 'react';
import { getStore, StoreConfigError } from '../../get-store.js';
import { loadConfig } from '../../config.js';
import { isDeadEnd, RemoteStoreError, type RemoteFailureKind } from '../../remote-store.js';
import { debugLog } from '../../debug-log.js';
import type { Store } from '../../store-interface.js';
import type { Task, TaskFilter } from '../../types.js';

/**
 * How the TUI is doing at reaching its store, derived from the same calls
 * that load the task list.
 *
 * This used to be inferred by a second, independent /healthz ping
 * (useServerStatus), which could report "up" while every query failed. The
 * only trustworthy signal for "can I see my tasks" is whether loading tasks
 * worked, so that is what this is.
 */
export type Connection =
  | { state: 'local' }
  | { state: 'connecting'; url: string }
  | { state: 'connected'; url: string }
  | { state: 'failed'; kind: RemoteFailureKind; url: string; message: string }
  | { state: 'misconfigured'; message: string };

/** Retry cadence for states only the user can clear (see the poll effect). */
const DEAD_END_POLL_MS = 15_000;

/** True while the TUI has no business showing a task list. */
export function isBlocking(conn: Connection): boolean {
  return conn.state === 'misconfigured' || (conn.state === 'failed' && isDeadEnd(conn.kind));
}

function classify(err: unknown, url: string): Connection {
  if (err instanceof RemoteStoreError) {
    return { state: 'failed', kind: err.kind, url: err.url ?? url, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { state: 'failed', kind: 'server', url, message };
}

export function useTaskStore(filter?: TaskFilter, pollInterval?: number) {
  // Built once. A StoreConfigError here means the config itself is
  // contradictory (mode: remote with no URL) — surface it instead of
  // crashing the TUI on its first render.
  const [{ store, connection: initialConnection }] = useState<{ store: Store | null; connection: Connection }>(() => {
    const client = loadConfig().client;
    const remoteUrl = client?.mode === 'remote' ? (client.remote_url ?? '') : null;
    try {
      return {
        store: getStore(),
        connection: remoteUrl === null ? { state: 'local' } : { state: 'connecting', url: remoteUrl },
      };
    } catch (err) {
      if (err instanceof StoreConfigError) {
        return { store: null, connection: { state: 'misconfigured', message: err.message } };
      }
      throw err;
    }
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [connection, setConnection] = useState<Connection>(initialConnection);
  // Once tasks have been seen, a later failure must not wipe them: mid-deploy
  // the edge answers 502 for a few seconds, and blanking the list every time
  // is worse than showing a slightly stale one next to a banner.
  const [hasLoaded, setHasLoaded] = useState(false);
  const isRemote = initialConnection.state !== 'local';

  const reload = useCallback(() => {
    if (!store) return;
    store
      .query(filter)
      .then((next) => {
        setTasks(next);
        setHasLoaded(true);
        if (!isRemote) return;
        setConnection((prev) => {
          if (prev.state === 'connected') return prev;
          debugLog('store.connected', { tasks: next.length, from: prev.state });
          return { state: 'connected', url: urlOf(prev) };
        });
      })
      .catch((err: unknown) => {
        if (!isRemote) return; // local store failures are not a connection concern
        const next = classify(err, urlOf(initialConnection));
        debugLog('store.reload failed', { kind: next.state === 'failed' ? next.kind : next.state });
        setConnection(next);
      });
  }, [filter, store, isRemote, initialConnection]);

  useEffect(() => {
    reload();
  }, [reload]);

  // A dead-end connection backs the poll off rather than stopping it. Each
  // remote attempt can spawn `cloudflared access token`, and doing that every
  // 2s to be told "not logged in" burns processes for a state only the user
  // can clear — but stopping outright would strand a running TUI with no way
  // back short of a restart. At 15s, `task-man login` in another terminal
  // reconnects this one on its own.
  const interval = pollInterval && pollInterval > 0
    ? (isBlocking(connection) ? DEAD_END_POLL_MS : pollInterval)
    : 0;
  useEffect(() => {
    if (interval <= 0) return;
    const id = setInterval(reload, interval);
    return () => clearInterval(id);
  }, [interval, reload]);

  return { tasks, reload, store, connection, hasLoaded };
}

function urlOf(conn: Connection): string {
  return conn.state === 'local' || conn.state === 'misconfigured' ? '' : conn.url;
}
