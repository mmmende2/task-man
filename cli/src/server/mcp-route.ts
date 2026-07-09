import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Hono } from 'hono';
import { registerTools } from '../mcp/tools.js';
import type { Store } from '../store-interface.js';
import { VERSION } from '../version.js';
import type { AppEnv } from './routes.js';
import { scopeStore } from './scoped-store.js';

export interface McpRouteDeps {
  store: Store;
  defaultOwner?: string;
}

// MCP over streamable HTTP, so remote MCP clients (the claude.ai connector,
// hence the iOS app) can use the same tools the stdio server exposes.
// Stateless on purpose: nothing survives between requests, so a deploy or
// container restart can't strand a client mid-session, and identity is
// re-derived from the Access JWT on every request anyway. The cost is a
// fresh McpServer per request — microseconds, single-user traffic.
export function mountMcp(app: Hono<AppEnv>, deps: McpRouteDeps): void {
  app.post('/mcp', async (c) => {
    const identity = c.get('accessIdentity');
    const store = identity ? scopeStore(deps.store, identity, deps.defaultOwner) : deps.store;

    const server = new McpServer({ name: 'task-man', version: VERSION });
    registerTools(server, { resolveStore: () => store, context: 'http', identity });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  // GET carries the server-push SSE stream and DELETE ends a session —
  // neither exists in stateless mode.
  app.on(['GET', 'DELETE'], '/mcp', (c) => c.json({ error: 'Method not allowed' }, 405));
}
