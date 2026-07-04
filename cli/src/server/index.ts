import { hostname, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { loadConfig } from '../config.js';
import { DEFAULT_SERVER_BIND, DEFAULT_SERVER_PORT } from '../constants.js';
import { LocalStore } from '../local-store.js';
import { accessAuthFromEnv } from './access-auth.js';
import { createApp } from './routes.js';
import { mountStatic } from './static.js';

export interface ServeOptions {
  port?: number;
  bind?: string;
  /** Override the built-frontend directory (defaults to ../dist-web). */
  webRoot?: string;
}

export interface RunningServer {
  port: number;
  bind: string;
  /** URLs to reach the app from another device on the LAN. */
  urls: string[];
  close: () => void;
}

/** dist-web sits next to dist/ in the published package; this file runs from dist/server/. */
export function resolveWebRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'dist-web');
}

function lanAddresses(): string[] {
  const nets = networkInterfaces();
  const addrs: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const ni of ifaces ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) addrs.push(ni.address);
    }
  }
  return addrs;
}

function reachableUrls(port: number, bind: string): string[] {
  if (bind === '127.0.0.1' || bind === 'localhost') {
    return [`http://localhost:${port}`];
  }
  const mdns = `${hostname().replace(/\.local$/i, '')}.local`;
  const urls = [`http://${mdns}:${port}`];
  for (const ip of lanAddresses()) urls.push(`http://${ip}:${port}`);
  return urls;
}

export function startServer(opts: ServeOptions = {}): RunningServer {
  const config = loadConfig();
  const port = opts.port ?? config.server?.port ?? DEFAULT_SERVER_PORT;
  const bind = opts.bind ?? config.server?.bind ?? DEFAULT_SERVER_BIND;

  const store = new LocalStore();
  const app = createApp({
    store,
    accessAuth: accessAuthFromEnv() ?? undefined,
    defaultOwner: process.env.TASK_MAN_DEFAULT_OWNER,
  });
  mountStatic(app, opts.webRoot ?? resolveWebRoot());

  const server = serve({ fetch: app.fetch, port, hostname: bind });

  return {
    port,
    bind,
    urls: reachableUrls(port, bind),
    close: () => server.close(),
  };
}
