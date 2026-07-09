import { existsSync } from 'node:fs';

// MCP servers (and anything GUI-launched) inherit a PATH without
// /opt/homebrew/bin on Apple Silicon, so resolving `cloudflared` by bare
// name finds nothing even when it's installed. Resolution order: explicit
// config, $CLOUDFLARED, well-known install dirs, bare name (PATH).
const CANDIDATES = [
  '/opt/homebrew/bin/cloudflared',
  '/usr/local/bin/cloudflared',
  '/usr/bin/cloudflared',
];

export interface ResolveCloudflaredOptions {
  /** Test seams. */
  env?: NodeJS.ProcessEnv;
  candidates?: string[];
}

export function resolveCloudflared(
  configuredPath?: string,
  opts: ResolveCloudflaredOptions = {},
): string {
  if (configuredPath) return configuredPath;
  const env = opts.env ?? process.env;
  if (env.CLOUDFLARED) return env.CLOUDFLARED;
  for (const path of opts.candidates ?? CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return 'cloudflared';
}
