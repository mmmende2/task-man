#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config.js';
import { createStoreResolver } from '../get-store.js';
import { VERSION } from '../version.js';
import { registerTools } from './tools.js';

const server = new McpServer({ name: 'task-man', version: VERSION });

registerTools(server, { resolveStore: createStoreResolver(), context: 'stdio' });

const transport = new StdioServerTransport();
await server.connect(transport);

// stderr is the only diagnostic surface a stdio MCP server has — say which
// store this process will talk to, so a stale/misconfigured mode is visible
// in the MCP logs instead of manifesting as a silent "0 tasks".
const client = loadConfig().client;
const mode = client?.mode === 'remote' && client.remote_url
  ? `remote (${client.remote_url})`
  : 'local';
console.error(`task-man MCP server v${VERSION} running on stdio — store: ${mode}`);
