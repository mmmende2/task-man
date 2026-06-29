// Shared task handlers — pure async functions over a TaskStore.
// No HTTP, no MCP, no UI concerns. Called by the MCP tools
// (mcp/src/tools.ts) and the REST routes (cli/src/server/routes.ts).
export * from './tasks.js';
export * from './stats.js';
