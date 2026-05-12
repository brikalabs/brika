/// <reference lib="webworker" />
/**
 * Brika bootstrap Service Worker.
 *
 * Intercepts every GET to `/assets/*` and serves the response from the
 * `brika-assets-v1` Cache. The page-side `bootstrap.ts` populates this cache
 * via the WebRTC bridge to the hub BEFORE injecting the app's `<script>` and
 * `<link>` tags, so by the time the browser fetches an asset URL every
 * lookup is a local hit — no network, no WebRTC round-trip.
 *
 * The SW is deliberately small. It owns one thing (cache lookup) and falls
 * back to the network on miss so a stale install never hard-fails: if the
 * Worker happens to ship the asset it serves it, otherwise the user sees a
 * normal 404 with the URL right there in the dev tools.
 *
 * Cache eviction is left to the browser. Assets are content-hashed by Vite,
 * so old entries stop being referenced after a hub upgrade — they sit in the
 * cache until storage pressure prompts eviction, which is fine.
 */

const ASSET_CACHE = 'brika-assets-v1';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  // Take over from any previous SW version immediately. The Brika bootstrap
  // is the only thing that writes to this cache, so a new version's claim
  // is always safe.
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/assets/')) return;
  event.respondWith(serveAssetFromCache(req));
});

async function serveAssetFromCache(req: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  // Cache miss — the bootstrap should have primed this. Falling back to the
  // network keeps the failure mode visible (a normal 404 instead of an
  // infinite spinner) and lets a future hub deploy that DOES ship the asset
  // recover automatically.
  return fetch(req);
}
