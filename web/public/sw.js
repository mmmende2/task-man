// Minimal service worker — caches the app shell so the page loads
// on flaky cellular, but NEVER caches /api/* (task data must be fresh).
// Bump CACHE_NAME on every deploy to invalidate the old shell.

const CACHE_NAME = 'task-man-shell-v2';
const APP_SHELL = ['/', '/index.html', '/icons/manifest.webmanifest', '/icons/icon.svg'];

// Re-used across every fetch so we don't reopen the cache on each request.
const cacheP = caches.open(CACHE_NAME);

self.addEventListener('install', (e) => {
  e.waitUntil(cacheP.then((c) => c.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch API or health pings — always go to network, never cache.
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  // Network-first for the HTML shell so deploys land immediately,
  // cache-fallback so the app still opens offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          cacheP.then((c) => c.put('/index.html', copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Cache-first for everything else under the origin (JS/CSS/icons).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ??
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            cacheP.then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => cached ?? Response.error()),
    ),
  );
});
