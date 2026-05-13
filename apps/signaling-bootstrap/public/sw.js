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
const ASSET_CACHE = 'brika-assets-v4';

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
const SW_VERSION = '4';
const SW_PING_PATH = '/__brika_sw_ping__';

globalThis.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== globalThis.location.origin) {
    return;
  }
  // Live `/api/*` requests can't be pre-cached (brick modules are loaded
  // on-demand, REST endpoints have request-specific bodies). Forward them
  // to the controlling page over postMessage so it can re-issue the call
  // through the WebRTC bridge — for EVERY method, not just GET. A mutating
  // verb like POST /api/auth/login would otherwise fall through to the
  // network and hit `hub.brika.dev` (which has no app surface).
  //
  // Route to the *originating* client (the page that made this request).
  // Falling back to `allClients[0]` would let a request emitted from tab A
  // be answered by tab B's transport — across hub bindings if the two tabs
  // target different hubs. Same-tab proxying preserves the hub identity
  // end-to-end.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(proxyThroughClient(req, event.clientId));
    return;
  }
  // Everything below this point is the static-asset cache path — GET-only.
  if (req.method !== 'GET') {
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
      // Cache miss. In Vite dev the BFS can't statically discover every
      // dynamic / conditional import (~3000 modules), so falling through
      // to the network here would hit the bootstrap origin and 404 →
      // SPA-fallback HTML with the wrong MIME → "Failed to load module
      // script". Instead route the miss through the page bridge so the
      // hub's dev-ui-proxy can serve the module from Vite. Slow on first
      // hit, cached for subsequent loads.
      const res = await proxyThroughClient(req, event.clientId);
      // Write the proxied result back into the cache so the next request
      // for the same URL hits locally. Clone first — Response bodies are
      // one-shot.
      if (res.ok) {
        const cacheable = res.clone();
        event.waitUntil(cache.put(req, cacheable).catch(() => {}));
      }
      return res;
    })()
  );
});

/**
 * Ask the originating page to re-issue this request through its WebRTC
 * bridge and stream the result back. The page wires up the listener
 * in `apps/ui/src/lib/api/sw-proxy.ts`. Returns 503 when the originating
 * client can't be resolved (e.g. during a hard refresh before the page
 * reconnects, or for navigation requests with no clientId).
 */
async function proxyThroughClient(req, clientId) {
  // Prefer the FetchEvent's `clientId` — the page that actually emitted
  // the request. Only fall back to "any window client" when clientId is
  // empty (top-level navigation, no controlling client yet).
  let client = clientId ? await globalThis.clients.get(clientId) : null;
  if (!client) {
    const windowClients = await globalThis.clients.matchAll({ type: 'window' });
    client = windowClients[0] ?? null;
  }
  if (!client) {
    return new Response('No controlling page available to proxy /api', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
  const headers = [];
  for (const [k, v] of req.headers) {
    headers.push([k, v]);
  }
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }
  const channel = new MessageChannel();
  client.postMessage(
    {
      type: 'brika:sw-proxy',
      url: req.url,
      method: req.method,
      headers,
      body,
    },
    [channel.port2]
  );
  // Stream the body chunk-by-chunk through the MessagePort. The previous
  // shape buffered the entire response via `arrayBuffer()` on the page
  // side, which hangs forever on streaming responses (SSE / long-poll /
  // `text/event-stream`) — bricks-not-loading was the visible symptom.
  // Head arrives first; chunks flow until end/error. The 30s timeout only
  // covers head arrival; once the head lands the stream lifetime is
  // governed by the chunks.
  return new Promise((resolve) => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    let headSeen = false;
    const headTimer = setTimeout(() => {
      if (!headSeen) {
        resolve(
          new Response('Bridge proxy timed out before head', {
            status: 504,
            headers: { 'content-type': 'text/plain' },
          })
        );
      }
    }, 30_000);
    channel.port1.onmessage = (event) => {
      const msg = event.data ?? {};
      if (msg.kind === 'head' && !headSeen) {
        headSeen = true;
        clearTimeout(headTimer);
        resolve(
          new Response(readable, {
            status: msg.status ?? 502,
            headers: msg.headers ?? [],
          })
        );
        return;
      }
      if (msg.kind === 'chunk' && msg.bytes) {
        void writer.write(new Uint8Array(msg.bytes));
        return;
      }
      if (msg.kind === 'end') {
        void writer.close();
        return;
      }
      if (msg.kind === 'error') {
        void writer.abort(new Error(msg.message ?? 'bridge error'));
      }
    };
  });
}
