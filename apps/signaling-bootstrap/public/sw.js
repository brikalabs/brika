// Brika bootstrap Service Worker — intercepts same-origin GETs and serves
// from the `brika-assets-v1` Cache. The page-side bootstrap pre-populates
// this cache via WebRTC BEFORE injecting the hub's `<script>` / `<link>`
// tags, so every browser fetch hits the cache locally. On miss we fall
// through to the network — keeps the SW transparent for resources the
// bootstrap didn't pre-cache (its own assets, /sw.js itself, etc.).
//
// This must intercept every path (not just `/assets/`) because Vite dev
// HTML pulls modules from `/src/`, `/@fs/`, `/@vite/`, and
// `/node_modules/.vite/deps/`, none of which match a `/assets/` prefix.
// We can intercept everything safely because the cache key is the full
// Request — anything we didn't `cache.put()` is a miss and falls through.
const ASSET_CACHE = 'brika-assets-v1';

globalThis.addEventListener('install', () => {
  globalThis.skipWaiting();
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim());
});

globalThis.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== globalThis.location.origin) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      return fetch(req);
    })()
  );
});
