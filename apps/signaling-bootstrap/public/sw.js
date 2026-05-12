// Brika bootstrap Service Worker — serves /assets/* from the
// `brika-assets-v1` Cache. The page-side bootstrap pre-populates this cache
// via WebRTC BEFORE injecting the hub's `<script>` / `<link>` tags, so every
// browser fetch hits the cache locally. On miss we fall through to the
// network — keeps the failure mode visible instead of an infinite spinner.
const ASSET_CACHE = 'brika-assets-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/assets/')) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      return fetch(req);
    })()
  );
});
