/**
 * Hub API transport.
 *
 * The transport is selected once at app boot. We detect "this UI is talking
 * to a remote hub" three ways, in order of preference:
 *
 *   1. `<meta name="brika:hub" content="<name>">` — the worker stamps this
 *      into every UI shell it serves. Most reliable; the worker has D1 +
 *      the request URL to work with.
 *
 *   2. `?hub=<name>` query parameter — explicit override on any hostname.
 *
 *   3. `hub.brika.dev/<name>/...` — path-based fallback for self-hosted
 *      coordinators where the worker shell wasn't able to inject the meta
 *      tag.
 *
 * If none of the above match, we use {@link FetchTransport} — the LAN/dev
 * default that just hits `window.fetch`.
 */

import { DataChannelTransport } from './data-channel-transport';
import { FetchTransport } from './fetch-transport';
import type { Transport } from './transport';

export {
  DataChannelTransport,
  type DataChannelTransportState,
  TransportError,
} from './data-channel-transport';
export { FetchTransport } from './fetch-transport';
export type { Transport } from './transport';

/** Are we running through the WebRTC bridge (vs. on a LAN hub directly)? */
export function isRemoteMode(): boolean {
  return detectRemote() !== null;
}

/**
 * Disconnect from the current hub binding and return to the bootstrap
 * landing screen. Clears `localStorage` hub name, drops every `brika-*`
 * cache (so the next bind fetches fresh assets), and navigates to the
 * coordinator origin's root. Only meaningful in remote mode; no-op
 * otherwise.
 */
export async function disconnectFromHub(): Promise<void> {
  const remote = detectRemote();
  if (!remote || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem('brika.bootstrap.hubName');
  } catch {
    /* private mode — already not stored */
  }
  // Purge cached hub bundle so the next bind doesn't serve stale modules.
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('brika-')).map((n) => caches.delete(n)));
    } catch {
      /* best effort */
    }
  }
  // Navigate to the coordinator root — the bootstrap landing card lets the
  // user pick a different hub name.
  globalThis.location.replace(remote.coordinatorOrigin);
}

const CANONICAL_HOST = 'hub.brika.dev';
const DEFAULT_COORDINATOR_ORIGIN = `https://${CANONICAL_HOST}`;
const HUB_QUERY_PARAM = 'hub';
const HUB_META_NAME = 'brika:hub';

/**
 * Read the hub name the worker stamped into the document head. The worker
 * injects `<meta name="brika:hub" content="<name>">` whenever it can resolve
 * the request to a hub — works for any URL the worker accepts.
 */
function hubFromMetaTag(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const tag = document.querySelector(`meta[name="${HUB_META_NAME}"]`);
  return tag?.getAttribute('content') || null;
}

let cachedTransport: Transport | null = null;
let cachedRemote: RemoteHints | null | undefined;

interface RemoteHints {
  readonly hubName: string;
  readonly hubOrigin: string;
  readonly coordinatorOrigin: string;
}

function hubOriginFor(name: string, coordinatorOrigin: string): string {
  try {
    return new URL(`/${name}`, coordinatorOrigin).toString();
  } catch {
    return `https://${CANONICAL_HOST}/${name}`;
  }
}

function detectRemote(): RemoteHints | null {
  if (cachedRemote !== undefined) {
    return cachedRemote;
  }
  if (globalThis.location === undefined) {
    cachedRemote = null;
    return null;
  }
  const loc = globalThis.location;
  // The bootstrap and the coordinator are the same Worker, so the page's
  // origin is the coordinator's origin — in prod (hub.brika.dev), in local
  // dev (localhost:5174), and in any self-hosted variant. Hard-coding the
  // canonical host here breaks the dev loop with a CORS error on /v1/tickets.
  const coordinatorOrigin = loc.origin || DEFAULT_COORDINATOR_ORIGIN;

  const hubName = resolveHubName(loc);
  cachedRemote = hubName
    ? { hubName, hubOrigin: hubOriginFor(hubName, coordinatorOrigin), coordinatorOrigin }
    : null;
  console.log('[brika-api] detectRemote', {
    hubName,
    cached: cachedRemote,
    metaTag: hubFromMetaTag(),
    hostname: loc.hostname,
    href: loc.href,
  });
  return cachedRemote;
}

function resolveHubName(loc: Location): string | null {
  // 1. <meta name="brika:hub"> — the worker stamps this into every UI shell
  //    it serves. Most reliable source: the worker has D1 + the request URL
  //    to work with; the browser only has the URL.
  const metaHub = hubFromMetaTag();
  if (metaHub) {
    return metaHub;
  }

  // 2. ?hub=<name> — explicit override, works on any hostname.
  const queryHub = new URL(loc.href).searchParams.get(HUB_QUERY_PARAM);
  if (queryHub) {
    return queryHub;
  }

  // 3. Path-based fallback: /<name>/... on the canonical host. Only kicks in
  //    when the worker's meta-tag injector didn't fire (degraded responses,
  //    self-hosted coordinators, etc.).
  if (loc.hostname.toLowerCase() === CANONICAL_HOST) {
    return loc.pathname.split('/').find((segment) => segment.length > 0) ?? null;
  }

  return null;
}

export function getTransport(): Transport {
  if (cachedTransport) {
    return cachedTransport;
  }
  const remote = detectRemote();
  if (remote) {
    cachedTransport = new DataChannelTransport({
      hubName: remote.hubName,
      hubOrigin: remote.hubOrigin,
      coordinatorOrigin: remote.coordinatorOrigin,
    });
    installFetchInterceptor(cachedTransport, remote.coordinatorOrigin);
  } else {
    cachedTransport = new FetchTransport();
  }
  return cachedTransport;
}

/**
 * Convenience wrapper — call this anywhere you would have called `fetch`.
 * Components don't need to know whether they're on LAN or remote.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getTransport().fetch(input, init);
}

// ─────────────────────────────────────────────────────────────────────────────
// Global fetch interceptor (remote mode only)
//
// Many code paths reach for `fetch()` directly: the i18n bulk loader, third-
// party libs, ad-hoc REST calls inside features, etc. Migrating each one to
// `apiFetch` would be a long whack-a-mole. Instead, when remote mode is
// active we wrap `globalThis.fetch` once at boot:
//
//   - Requests whose URL is `/api/*` (relative or absolute against the
//     current origin) are routed through the WebRTC transport.
//   - Everything else — including the data-channel transport's own internal
//     calls to the coordinator — flows through the original `fetch`.
//
// The interceptor is installed exactly once and is idempotent on hot-reloads.
// ─────────────────────────────────────────────────────────────────────────────

let interceptorInstalled = false;

function installFetchInterceptor(transport: Transport, coordinatorOrigin: string): void {
  if (interceptorInstalled) {
    return;
  }
  interceptorInstalled = true;

  const original = globalThis.fetch.bind(globalThis);
  let coordinatorHost = '';
  try {
    coordinatorHost = new URL(coordinatorOrigin).host;
  } catch {
    // ignore — interceptor will treat coordinator as unmatched and pass through
  }

  globalThis.fetch = (input, init) => {
    const url = resolveUrl(input);
    if (!url) {
      return original(input, init);
    }
    // Coordinator calls (signaling, tickets) MUST bypass the transport — they
    // are how the transport itself comes online.
    if (url.host === coordinatorHost && url.pathname.startsWith('/v1/')) {
      return original(input, init);
    }
    // Hub API surface — route through the transport.
    if (url.pathname.startsWith('/api/')) {
      return transport.fetch(input, init);
    }
    return original(input, init);
  };
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') {
      return new URL(input, globalThis.location.href);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(input.url, globalThis.location.href);
  } catch {
    return null;
  }
}

// Eagerly construct the transport at module-load time when remote mode is
// active. This installs the global fetch interceptor before any module that
// imports `@/lib/api` indirectly (i18n, query, etc.) has a chance to issue
// its first request.
if (detectRemote()) {
  console.log('[brika-api] remote mode — installing transport + SW proxy');
  const transport = getTransport();
  // Wire up the bootstrap SW → page bridge so dynamic `import()` of
  // plugin/brick modules under `/api/bricks/modules/...` round-trip
  // through the WebRTC data channel instead of falling through to the
  // CF Worker (which returns SPA-fallback HTML).
  const { installSwProxyListener } = await import('./sw-proxy');
  installSwProxyListener(transport);
  console.log('[brika-api] sw proxy listener installed', {
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
  });
} else {
  console.warn('[brika-api] NOT remote mode — sw proxy NOT installed (no meta tag / no hub)');
}
