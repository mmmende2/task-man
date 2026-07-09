import { loadConfig } from './config.js';
import { LocalStore } from './local-store.js';
import { authFromConfig, RemoteStore } from './remote-store.js';
import { TaskStore } from './store.js';
import type { Store } from './store-interface.js';
import type { TaskManConfig } from './types.js';

function buildStore(client: TaskManConfig['client']): Store {
  if (client?.mode === 'remote' && client.remote_url) {
    return new RemoteStore(client.remote_url, { authHeaders: authFromConfig(client) });
  }
  return new LocalStore(new TaskStore());
}

// One-shot resolution for short-lived processes (CLI commands, TUI boot).
// Long-lived processes should use createStoreResolver() instead so config
// changes apply without a restart.
export function getStore(): Store {
  return buildStore(loadConfig().client);
}

// For long-lived processes (the MCP server): re-reads config on every call,
// so flipping client.mode applies on the next tool call instead of requiring
// a full process restart (reconnecting the MCP client is NOT a restart — the
// server process survives it). The store instance is reused while the client
// config is unchanged: RemoteStore caches its cloudflared token, and
// rebuilding per call would re-exec cloudflared every time.
export function createStoreResolver(): () => Store {
  let cached: { fingerprint: string; store: Store } | null = null;
  return () => {
    const client = loadConfig().client;
    const fingerprint = JSON.stringify(client ?? {});
    if (cached?.fingerprint !== fingerprint) {
      cached = { fingerprint, store: buildStore(client) };
    }
    return cached.store;
  };
}
