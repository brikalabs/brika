/**
 * Brika bootstrap Service Worker — intercepts same-origin GETs and serves
 * from the per-build `brika-assets-<BUILD_ID>` Cache. The page-side
 * bootstrap pre-populates this cache via WebRTC BEFORE injecting the
 * hub's `<script>` / `<link>` tags, so every browser fetch hits the cache
 * locally. On miss we fall through to the network — keeps the SW
 * transparent for resources the bootstrap didn't pre-cache (its own
 * assets, /sw.js itself, etc.).
 *
 * This must intercept every path (not just `/assets/`) because Vite dev
 * HTML pulls modules from `/src/`, `/@fs/`, `/@vite/`, and
 * `/node_modules/.vite/deps/`, none of which match a `/assets/` prefix.
 * Intercepting everything is safe because the cache key is the full
 * Request — anything we didn't `cache.put()` is a miss and falls through.
 *
 * Cache rotation is automatic — the cache name embeds the build ID
 * injected by vite.config.ts (Git short SHA), so every deploy rotates
 * the name. The `activate` handler below deletes every prior
 * `brika-assets-*` cache, so users on the old build land on a clean
 * slate on the first visit after deploy — no manual bumping anywhere.
 */

/// <reference lib="webworker" />

// `lib: "WebWorker"` alone types `globalThis` as `WorkerGlobalScope` — the
// broad base scope, missing SW-specific events (`install`, `activate`,
// `fetch`) and the `clients` / `skipWaiting()` surface. Alias once as
// `ServiceWorkerGlobalScope` and use the alias throughout — redeclaring
// the global itself collides with the lib's existing declaration.
const sw = globalThis as unknown as ServiceWorkerGlobalScope;

// Cache name auto-rotates per build — `__BRIKA_BUILD_ID__` is injected by
// the esbuild `define` in apps/signaling/vite.config.ts (Git short SHA, or
// a unix-timestamp fallback when git isn't available). The `activate`
// handler below wipes every prior `brika-assets-*` cache, so users on the
// old bootstrap auto-heal to a clean slate on the first visit after a
// deploy without any manual version bumping.
//
// `typeof` guard so a dev session that booted before the `define` was
// added still loads — the esbuild plugin runs on the next configResolved
// (server restart), and until then this falls back to a stable "dev"
// bucket instead of throwing ReferenceError at module load.
const ASSET_CACHE = `brika-assets-${typeof __BRIKA_BUILD_ID__ === 'undefined' ? 'dev' : __BRIKA_BUILD_ID__}`;

// Visible in the SW's own DevTools console (Application → Service Workers →
// click the SW link). Pairs with the page-side `[brika-sw]` logs so a failed
// boot can be traced across both sides.
const log = (...args: unknown[]): void => console.log('[brika-sw][worker]', ...args);

log('script loaded', { scope: sw.registration?.scope ?? null });

sw.addEventListener('install', (event: ExtendableEvent) => {
  log('install');
  event.waitUntil(sw.skipWaiting().then(() => log('skipWaiting resolved')));
});

// Set of FetchEvent clientIds that have installed the page-side proxy
// listener (apps/ui/src/lib/api/sw-proxy.ts) and explicitly told us so
// via `BRIKA_PROXY_READY`. We only proxy through clients we've seen
// register — without this signal we couldn't tell the bootstrap document
// (which has no listener) apart from the hub-UI document (which does),
// and posting to a client with no listener hangs until the head timer
// expires (504). Cleared automatically when the SW restarts.
const proxyReadyClients = new Set<string>();

interface SwMessage {
  type?: string;
}

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  // Gate on origin BEFORE touching `event.data`. Same-origin policy
  // already restricts who can register/control this SW, but dropping
  // any anomalous origin here is defence-in-depth against a tampered
  // bridge that forwards events from a non-matching context.
  const expectedOrigin = sw.location.origin;
  if (event.origin !== expectedOrigin && event.origin !== '') {
    log('message dropped — origin mismatch', { origin: event.origin });
    return;
  }
  const data = event.data as SwMessage | undefined;
  log('message received', {
    type: data?.type,
    origin: event.origin,
    swOrigin: sw.location.origin,
    sourceId: event.source && 'id' in event.source ? event.source.id : null,
    sourceType: event.source?.constructor.name ?? null,
  });
  if (data?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
    return;
  }
  // Page-initiated claim. `clients.claim()` normally runs only inside the
  // `activate` handler; on a subsequent page load the SW is *already*
  // activated, so claim() never re-fires and the new page can come up
  // uncontrolled (especially with DevTools "Bypass for network" or after an
  // HMR-triggered reload). The page-side `ensureServiceWorker` posts this
  // when it finds itself with `navigator.serviceWorker.controller === null`
  // but a registration that does have an `active` worker.
  if (data?.type === 'CLAIM') {
    log('CLAIM requested by page');
    void sw.clients.claim().then(() => log('clients.claim() resolved'));
    return;
  }
  // The hub-UI's installSwProxyListener posts this immediately after
  // wiring its message handler. event.source is the originating client;
  // its `.id` matches what FetchEvent.clientId will be for sub-resource
  // requests from that document.
  if (data?.type === 'BRIKA_PROXY_READY' && event.source && 'id' in event.source) {
    proxyReadyClients.add(event.source.id);
    log('proxy registered', {
      clientId: event.source.id,
      totalReady: proxyReadyClients.size,
    });
  }
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  log('activate');
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const stale = names.filter((n) => n.startsWith('brika-assets-') && n !== ASSET_CACHE);
      if (stale.length > 0) {
        log('dropping stale caches', stale);
      }
      await Promise.all(stale.map((n) => caches.delete(n)));
      // clients.claim() takes control of any pages already open under
      // a previous SW — so an in-flight bootstrap visit auto-heals
      // without forcing a manual unregister + hard refresh.
      await sw.clients.claim();
      log('clients.claim resolved');
    })()
  );
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) {
    return;
  }
  // Navigation requests (top-level document loads) must never be
  // proxied. The bootstrap origin serves the SPA-fallback HTML; the
  // bootstrap then runs, registers this SW, and loads the hub via
  // WebRTC. If we intercepted nav and tried to proxy through a stale
  // client (or no client at all), refreshes would 503/504 the user's
  // own tab instead of re-running the bootstrap.
  if (req.mode === 'navigate') {
    return;
  }
  // Live `/api/*` requests can't be pre-cached (brick modules are loaded
  // on-demand, REST endpoints have request-specific bodies). Forward them
  // to the controlling page over postMessage so it can re-issue the call
  // through the WebRTC bridge — for EVERY method, not just GET. A mutating
  // verb like POST /api/auth/login would otherwise fall through to the
  // network and hit `hub.brika.dev` (which has no app surface).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(proxyOr503(req, event.clientId));
    return;
  }
  // Everything below this point is the static-asset cache path — GET-only.
  if (req.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      // Cache match policy:
      //  - For Vite dep-optimizer URLs (`?v=<hash>`) match EXACTLY on
      //    the hash. Same hash = same module bytes; serving a stale
      //    `?v=OLD` body for a `?v=NEW` request would register the
      //    OLD body under the NEW URL key in the browser module
      //    registry, and the BYTES inside reference `?v=OLD` imports
      //    — those resolve to a SECOND module instance. With React
      //    that surfaces as "Invalid hook call ... more than one
      //    copy of React in the same app" → useState throws null
      //    dispatcher. Hash rotation = forced re-fetch through the
      //    bridge; that's correct, not a perf regression to undo.
      //  - For everything else use `ignoreSearch: true` so non-hash
      //    query strings (timestamps, HMR tokens) still hit cache.
      const shortUrl = url.pathname + (url.search.length > 24 ? '?…' : url.search);
      const matchOpts = url.searchParams.has('v') ? undefined : { ignoreSearch: true };
      const cached = await cache.match(req, matchOpts);
      if (cached) {
        log('serve from cache', { url: shortUrl, status: cached.status });
        return cached;
      }
      // Cache miss. Two distinct callers reach here:
      //  - The hub UI loaded via WebRTC, dynamically importing a Vite-
      //    served module the BFS didn't statically discover (~3000 modules
      //    in dev). Route through the page bridge so the hub's dev-ui-proxy
      //    can serve the module; cache the response for next time.
      //  - The bootstrap document itself, fetching its own resources
      //    (favicon.ico, /sw.js, vite HMR assets in local dev). These
      //    have no proxy listener — fall through to the origin network.
      // We use the proxyReadyClients gate to distinguish the two: a
      // hub-UI document has explicitly registered; the bootstrap hasn't.
      const client = await resolveProxyClient(event.clientId);
      if (client) {
        log('cache miss → proxy through client', { url: shortUrl });
        const res = await proxyThroughClient(req, client);
        if (res.ok) {
          const cacheable = res.clone();
          event.waitUntil(cache.put(req, cacheable).catch(() => {}));
          log('proxied + cached', { url: shortUrl, status: res.status });
        } else {
          log('proxied (NOT cached, !ok)', { url: shortUrl, status: res.status });
        }
        return res;
      }
      log('cache miss → network fallback', { url: shortUrl });
      try {
        const res = await fetch(req);
        log('network served', {
          url: shortUrl,
          status: res.status,
          contentType: res.headers.get('content-type'),
        });
        return res;
      } catch (err) {
        log('network FAILED', { url: shortUrl, err: String(err) });
        return new Response(`SW network fallback failed: ${err}`, {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        });
      }
    })()
  );
});

/**
 * `/api/*` request that we can't fulfil without a hub bridge: if no
 * ready client is around, return a clear 503 instead of hanging on the
 * head timer. The hub UI never calls /api before installSwProxyListener
 * runs (the import is top-level-awaited), so this 503 only fires when
 * something has gone wrong — usually a refresh interrupting the boot.
 */
async function proxyOr503(req: Request, clientId: string): Promise<Response> {
  const client = await resolveProxyClient(clientId);
  if (!client) {
    log('/api 503', {
      url: req.url,
      fetchClientId: clientId || '<empty>',
      ready: [...proxyReadyClients],
    });
    return new Response('No controlling page available to proxy /api', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
  return proxyThroughClient(req, client);
}

/**
 * Return the originating Client iff it has registered as proxy-ready.
 * Never falls back to "any window client" — cross-tab proxying would
 * route a request emitted from tab A through tab B's bridge, possibly
 * targeting a different hub.
 */
async function resolveProxyClient(clientId: string): Promise<Client | null> {
  if (!clientId || !proxyReadyClients.has(clientId)) {
    return null;
  }
  const client = await sw.clients.get(clientId);
  if (!client) {
    // Client went away — purge so the Set doesn't grow unbounded over
    // long-lived SWs. (Browsers also kill the SW periodically.)
    proxyReadyClients.delete(clientId);
    return null;
  }
  return client;
}

interface ProxyHead {
  kind: 'head';
  status?: number;
  headers?: Array<[string, string]>;
}
interface ProxyChunk {
  kind: 'chunk';
  bytes?: ArrayBuffer;
}
interface ProxyEnd {
  kind: 'end';
}
interface ProxyError {
  kind: 'error';
  message?: string;
}
type ProxyMessage = ProxyHead | ProxyChunk | ProxyEnd | ProxyError;

/**
 * Ask the page to re-issue this request through its WebRTC bridge and
 * stream the result back. The page-side listener lives in
 * `apps/ui/src/lib/api/sw-proxy.ts`.
 */
async function proxyThroughClient(req: Request, client: Client): Promise<Response> {
  const headers: Array<[string, string]> = [];
  for (const [k, v] of req.headers) {
    headers.push([k, v]);
  }
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.arrayBuffer() : null;
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
  return new Promise<Response>((resolve) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    // Track writer liveness so post-cancel write/close/abort doesn't surface
    // as "Uncaught (in promise) TypeError: Cannot write to a CLOSED writable
    // stream" when the downstream Response is dropped (HMR, navigation, dedupe).
    // writer.closed fulfils on normal close and rejects on abort/downstream
    // cancel — both flip the flag.
    let writerClosed = false;
    const markClosed = (): void => {
      writerClosed = true;
    };
    // Any settlement of writer.closed (normal close or downstream cancel
    // reject) flips the flag. The `.catch(() => {})` is the only
    // suppression — it consumes the well-defined cancel rejection so it
    // doesn't surface as an unhandled promise rejection.
    writer.closed.catch(() => {}).finally(markClosed);
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
    channel.port1.onmessage = (event: MessageEvent<ProxyMessage>) => {
      // MessageChannel ports are private and unaddressable from other
      // contexts, so `event.origin` is always empty here — but mirror the
      // origin guard convention so anyone tampering with the port from a
      // shimmed context can't push a non-empty value through unchecked.
      if (event.origin && event.origin !== sw.location.origin) {
        return;
      }
      const msg = event.data;
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
        if (writerClosed) return;
        writer.write(new Uint8Array(msg.bytes)).catch(markClosed);
        return;
      }
      if (msg.kind === 'end') {
        if (writerClosed) return;
        writer.close().catch(markClosed);
        return;
      }
      if (msg.kind === 'error') {
        // If the error arrives before head, resolve with a 502 so the
        // browser sees an actual response instead of waiting on the head
        // timer. Otherwise abort the in-flight stream.
        if (!headSeen) {
          headSeen = true;
          clearTimeout(headTimer);
          resolve(
            new Response(`Bridge proxy error: ${msg.message ?? 'unknown'}`, {
              status: 502,
              headers: { 'content-type': 'text/plain' },
            })
          );
          return;
        }
        if (!writerClosed) {
          writer.abort(new Error(msg.message ?? 'bridge error')).catch(markClosed);
        }
      }
    };
  });
}
