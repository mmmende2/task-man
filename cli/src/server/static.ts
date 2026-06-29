import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Hono } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

// Static frontend with SPA fallback. Hashed asset files
// (Vite output) get a long cache; index.html and the service
// worker are always revalidated so deploys land immediately.
// NOTE: /api/* is never reached here — those routes are registered
// before this catch-all, so task data is never served from cache.
export function mountStatic(app: Hono, root: string): void {
  // Validated once at mount; we don't pay an existsSync per request.
  const rootMissing = !existsSync(root);
  const indexPath = join(root, 'index.html');

  app.get('/*', async (c) => {
    if (rootMissing) {
      return c.text(
        'Web frontend not built. Run `npm run build` (copies web/dist -> cli/dist-web).',
        503,
      );
    }

    const pathname = new URL(c.req.url).pathname;
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    const filePath = normalize(join(root, rel));
    // Path-traversal guard: must stay inside root.
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      return c.text('forbidden', 403);
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return serveFile(filePath);
    }
    // SPA fallback — client-side routes (/login, /capture) resolve to the shell.
    return serveFile(indexPath);
  });
}

async function serveFile(filePath: string) {
  const buf = await readFile(filePath);
  const ext = extname(filePath);
  const type = MIME[ext] ?? 'application/octet-stream';
  const base = filePath.split(sep).pop() ?? '';

  const headers: Record<string, string> = { 'Content-Type': type };
  if (base === 'index.html' || base === 'sw.js' || base === 'manifest.webmanifest') {
    headers['Cache-Control'] = 'no-cache';
  } else if (/\.[0-9a-f]{8,}\./i.test(base)) {
    // Vite content-hashed asset — safe to cache hard.
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'no-cache';
  }
  return new Response(new Uint8Array(buf), { status: 200, headers });
}
