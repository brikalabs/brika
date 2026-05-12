// Brika bootstrap Service Worker — intercepts same-origin GETs and serves
// from the `brika-assets-v2` Cache. The page-side bootstrap pre-populates
// this cache via WebRTC BEFORE injecting the hub's `<script>` / `<link>`
// tags, so every browser fetch hits the cache locally. On miss we fall
// through to the network — keeps the SW transparent for resources the
// bootstrap didn't pre-cache (its own assets, /sw.js itself, etc.).
//
// This must intercept every path (not just `/assets/`) because Vite dev
// HTML pulls modules from `/src/`, `/@fs/`, `/@vite/`, and
// `/node_modules/.vite/deps/`, none of which match a `/assets/` prefix.
// Intercepting everything is safe because the cache key is the full
// Request — anything we didn't `cache.put()` is a miss and falls through.
//
// Bump the cache name (v1 → v2 → …) whenever the cached-shape semantics
// change. The activate handler deletes every prior `brika-assets-*`
// cache so users carrying a stale one get a clean slate automatically.
const ASSET_CACHE = 'brika-assets-v2';

globalThis.addEventListener('install', () => {
  // skipWaiting() lets the new SW replace any previous version as soon
  // as it's installed, without waiting for every tab to close.
  globalThis.skipWaiting();
});

// Backstop for skipWaiting: the bootstrap can post SKIP_WAITING if it
// detects a waiting SW. Some browsers don't propagate the install-time
// skipWaiting() call reliably across page navigations. Only accept the
// message when the sender's origin matches our own scope.
globalThis.addEventListener('message', (event) => {
  if (event.origin !== globalThis.location.origin) {
    return;
  }
  if (event.data?.type === 'SKIP_WAITING') {
    globalThis.skipWaiting();
  }
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('brika-assets-') && n !== ASSET_CACHE)
          .map((n) => caches.delete(n))
      );
      // clients.claim() takes control of any pages already open under
      // a previous SW — so an in-flight bootstrap visit auto-heals
      // without forcing a manual unregister + hard refresh.
      await globalThis.clients.claim();
    })()
  );
});

// Sentinel URL the bootstrap pings to verify it's talking to a fresh
// SW. Bump alongside ASSET_CACHE whenever the SW contract changes.
const SW_VERSION = '2';
const SW_PING_PATH = '/__brika_sw_ping__';

globalThis.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== globalThis.location.origin) {
    return;
  }
  if (url.pathname === SW_PING_PATH) {
    event.respondWith(
      new Response(SW_VERSION, {
        headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
      })
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      try {
        return await fetch(req);
      } catch (err) {
        // Surface network failures as a 502 instead of an unhandled
        // promise rejection in the SW (which the browser logs as an
        // ugly "FetchEvent resulted in a network error response").
        return new Response(`SW network fallback failed: ${err}`, {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        });
      }
    })()
  );
});
