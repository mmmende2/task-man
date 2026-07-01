import { loadConfig } from './config.js';
import { LocalStore } from './local-store.js';
import { authFromConfig, RemoteStore } from './remote-store.js';
import { TaskStore } from './store.js';
import type { Store } from './store-interface.js';

// Called once at module/hook init in the TUI and MCP — switching
// client.mode while a process is already running takes effect only on
// the next restart. Not dynamic on purpose (see docs/phase1-technical-plan.md §9).
export function getStore(): Store {
  const cfg = loadConfig();
  if (cfg.client?.mode === 'remote' && cfg.client.remote_url) {
    return new RemoteStore(cfg.client.remote_url, { authHeaders: authFromConfig(cfg.client) });
  }
  return new LocalStore(new TaskStore());
}
