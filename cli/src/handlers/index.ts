// Shared task handlers — pure async functions over a TaskStore.
// No HTTP, no MCP, no UI concerns. Called by the MCP tools
// (mcp/src/tools.ts) and the REST routes (cli/src/server/routes.ts).
export * from './tasks.js';
export * from './stats.js';
// `metrics.js` is intentionally NOT re-exported here. It pulls in
// `report.js` → `insights.js` which imports node:fs; the web's
// `Focus.tsx` imports from this barrel and would otherwise drag those
// modules into the browser bundle. Import `buildMetrics` directly from
// `./metrics.js` instead.
