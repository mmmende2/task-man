import { createHttpClient } from './api-client.js';
import { loadConfig } from './config.js';
import { TASKS_FILE } from './constants.js';
import { authFromConfig } from './remote-store.js';
import { VERSION } from './version.js';

// The diagnostic the 2026-07 remote-migration confusion was missing: MCP
// reported "0 tasks" with no way to tell it was still pointed at the retired
// local store. Shared by `task-man whoami` and the task_whoami MCP tool.
export interface WhoamiInfo {
  mode: 'local' | 'remote';
  client_version: string;
  /** local mode only */
  store_path?: string;
  /** remote mode only */
  remote_url?: string;
  auth?: 'service_token' | 'cloudflared';
  reachable?: boolean;
  server_version?: string;
  identity?: string | null;
  error?: string;
}

export async function whoami(): Promise<WhoamiInfo> {
  const client = loadConfig().client;
  if (client?.mode !== 'remote' || !client.remote_url) {
    return { mode: 'local', client_version: VERSION, store_path: TASKS_FILE };
  }

  const info: WhoamiInfo = {
    mode: 'remote',
    client_version: VERSION,
    remote_url: client.remote_url,
    auth: client.service_token_id && client.service_token_secret ? 'service_token' : 'cloudflared',
  };

  try {
    const headers = await authFromConfig(client)();
    const http = createHttpClient({ baseUrl: client.remote_url });
    const health = await http.req<{ ok: boolean; version?: string }>('/healthz', { headers });
    info.reachable = health.ok === true;
    info.server_version = health.version;
    try {
      const who = await http.req<{ identity: string | null }>('/api/whoami', { headers });
      info.identity = who.identity;
    } catch {
      // Pre-/api/whoami servers fall through to the SPA catch-all (HTML,
      // not JSON) — reachability already succeeded, so report the gap
      // rather than a parse error.
      info.error = `server v${info.server_version ?? '?'} does not expose /api/whoami — deploy a newer server to see identity`;
    }
  } catch (err) {
    info.reachable ??= false;
    info.error = (err as Error).message;
  }
  return info;
}
