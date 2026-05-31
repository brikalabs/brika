/**
 * Bootstrap-side SW proxy bridge.
 *
 * Companion to `apps/signaling/sw/sw.ts`. When the hub UI's `<script
 * type="module">` injects and the browser starts walking the dep tree,
 * every transitive import becomes a SW intercept → cache miss. The SW
 * tries to proxy through the *page* (this document) so the request can
 * be re-issued via WebRTC to the hub's dev-ui-proxy → Vite. This module
 * is the listener that closes that loop.
 *
 * Why this exists in the bootstrap and not just in the hub UI's
 * sw-proxy.ts: the hub UI installs its own listener as a side-effect of
 * loading `apps/ui/src/lib/api/index.ts`, but loading THAT module is
 * itself a transitive import that needs the bridge to be alive — a
 * chicken-and-egg. The bootstrap installs a primordial bridge using
 * the existing WebRTC peer the moment the entry HTML is fetched and
 * BEFORE scripts are injected.
 *
 * Handoff: once the hub UI's `installSwProxyListener` is reached, it
 * calls the global `__brikaBootProxyUninstall` we publish below to tear
 * down THIS listener so there is exactly one responder per SW message.
 * Without the handoff both listeners would fire for every proxy event
 * and both would post to the same MessagePort — the SW would commit
 * whichever head/chunk frame arrived first and the late one would
 * write to an already-closed writable, corrupting responses at random.
 */

import type { PeerHandle } from './peer';

interface ProxyRequest {
  readonly type: 'brika:sw-proxy';
  readonly url: string;
  readonly method: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly body: ArrayBuffer | null;
}

/**
 * Global handoff hook. The hub UI's `installSwProxyListener` calls this
 * before adding its own message listener so only one listener at a time
 * responds. Typed loosely on the global to keep this module's surface
 * tiny — the consumer just `globalThis.__brikaBootProxyUninstall?.()`s.
 */
declare global {
  // eslint-disable-next-line no-var
  var __brikaBootProxyUninstall: (() => void) | undefined;
  // Set in `bootstrap.tsx`; unmounted here once the hub UI takes over
  // so the bootstrap's React fiber stops pointing at a detached DOM.
  // Typed as `{ unmount(): void }` to avoid pulling react-dom/client
  // types into this otherwise pure-browser module.
  // eslint-disable-next-line no-var
  var __brikaBootstrapRoot: { unmount(): void } | undefined;
  // Flipped to `true` by `injectGraph` once the hub UI has taken over
  // the page. `bootstrap.tsx` reads this on module load to refuse a
  // second mount on HMR re-eval. Survives within the same page session,
  // resets on a real reload — which is exactly the boundary the
  // bootstrap should re-run on.
  // eslint-disable-next-line no-var
  var __brikaHandoffDone: boolean | undefined;
}

let installed = false;

const log = (...args: unknown[]): void => console.log('[brika-boot-proxy]', ...args);

/**
 * Install the bootstrap's primordial SW-proxy listener. Idempotent:
 * calling more than once is a no-op.
 *
 * Caller MUST already have a controlling Service Worker (the SW must
 * have claimed this client) — otherwise `BRIKA_PROXY_READY` is dropped
 * into the void and the SW falls through to network.
 */
export function installBootstrapSwProxy(peer: PeerHandle): void {
  if (installed) {
    log('install skipped — already installed');
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    log('install skipped — no navigator.serviceWorker');
    return;
  }
  installed = true;

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as ProxyRequest | undefined;
    if (data?.type !== 'brika:sw-proxy') {
      return;
    }
    const port = event.ports[0];
    if (!port) {
      return;
    }
    void handleProxiedRequest(peer, data, port);
  };
  const onControllerChange = (): void => notifyReady('controllerchange');

  navigator.serviceWorker.addEventListener('message', onMessage);
  notifyReady('install');
  // Re-announce on controllerchange (a new SW takes over after activate
  // → claim; the SW's `proxyReadyClients` is cleared, so we have to
  // re-tell it we're listening).
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  globalThis.__brikaBootProxyUninstall = () => {
    if (!installed) {
      return;
    }
    navigator.serviceWorker.removeEventListener('message', onMessage);
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    installed = false;
    globalThis.__brikaBootProxyUninstall = undefined;
    // The hub UI is fully taking over. Unmount the bootstrap's React
    // tree NOW so its fiber stops pointing at the detached `#root`
    // div `injectGraph` already removed. Any later state push (HMR,
    // controllerchange, StrictMode effect re-run) would otherwise
    // re-enter `useState` on a null dispatcher and throw
    // `Cannot read properties of null (reading 'useState')`. Unmount
    // also runs the bootstrap's useEffect cleanups synchronously,
    // closing the WebRTC peer — safe at this point because the hub
    // UI's transport has already minted its own ticket and opened
    // its own peer.
    globalThis.__brikaBootstrapRoot?.unmount();
    globalThis.__brikaBootstrapRoot = undefined;
    log('uninstalled — hub UI listener has taken over');
  };
}

function notifyReady(trigger: string): void {
  const controller = navigator.serviceWorker.controller;
  log('notifyReady', { trigger, hasController: !!controller });
  controller?.postMessage({ type: 'BRIKA_PROXY_READY' });
}

/**
 * Normalise the SW-forwarded URL into the path+query shape `peer.request`
 * accepts. Two transforms happen here:
 *
 *  1. **Strip the origin.** The SW posts `req.url` verbatim, which is
 *     fully-qualified (`http://localhost:5174/src/router.tsx`). The hub's
 *     `rpcRequestToFetch` refuses anything that isn't path-absolute as a
 *     guard against peer-controlled hosts (`rpc: refusing non-absolute
 *     path "…"`) — without dropping the origin every source-file proxy
 *     would surface as a `bad-request` reject and the SW would synthesize
 *     a 502.
 *  2. **Drop Vite's optimizer cache-buster (`?v=<hash>`).** Vite rotates
 *     the hash whenever its dep graph changes; once rotated, requests
 *     with the OLD hash return **504 Outdated Optimize Dep**, not 404 —
 *     so a cached entry script referencing `react.js?v=OLD` would have
 *     every transitive import 504 forever.
 *
 * The hash is a Vite-side optimisation marker; content doesn't depend on
 * it. Production hubs don't use `?v=`, so step 2 is a no-op there.
 */
// Placeholder base for `new URL(...)` when the caller already passed a
// path-relative URL. The origin is discarded by the return statement,
// so the scheme is purely a parser hint; `https` keeps Sonar's
// hard-coded-http rule (S5332) quiet without changing behaviour.
const URL_PARSER_BASE = 'https://placeholder.invalid';

function toForwardedPath(url: string): string {
  try {
    const u = new URL(url, URL_PARSER_BASE);
    u.searchParams.delete('v');
    return u.pathname + (u.search.length > 0 ? u.search : '');
  } catch {
    return url.startsWith('/') ? url : `/${url}`;
  }
}

/**
 * The bootstrap bridge is a static-asset boot helper. `peer.request`
 * only carries `(method, url)` — no body, no caller headers — so the
 * bridge can ONLY satisfy requests where neither of those matter. GETs
 * and HEADs for ES modules / CSS / fonts qualify; anything carrying a
 * body (avatar uploads, JSON POSTs, multipart forms) does not — passing
 * those through would silently truncate the request. After the handoff
 * the hub UI listener handles everything and this check is moot, but
 * keep it as a defence in depth for the brief window where both might
 * be live during the handoff microtask.
 */
function bridgeCanHandle(data: ProxyRequest): boolean {
  if (data.body !== null && data.body.byteLength > 0) {
    return false;
  }
  const method = data.method.toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

async function handleProxiedRequest(
  peer: PeerHandle,
  data: ProxyRequest,
  port: MessagePort
): Promise<void> {
  if (!bridgeCanHandle(data)) {
    return;
  }
  try {
    const forwardUrl = toForwardedPath(data.url);
    const res = await peer.request(data.method, forwardUrl);
    const respHeaders: Array<[string, string]> = [];
    res.headers.forEach((v, k) => respHeaders.push([k, v]));
    port.postMessage({ kind: 'head', status: res.status, headers: respHeaders });

    if (!res.body) {
      port.postMessage({ kind: 'end' });
      return;
    }
    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value && value.byteLength > 0) {
          const copy = new ArrayBuffer(value.byteLength);
          new Uint8Array(copy).set(value);
          port.postMessage({ kind: 'chunk', bytes: copy }, [copy]);
        }
      }
      port.postMessage({ kind: 'end' });
    } finally {
      reader.releaseLock();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[brika-boot-proxy] request failed', {
      url: data.url,
      forwardedAs: toForwardedPath(data.url),
      message,
      errName: err instanceof Error ? err.name : null,
    });
    port.postMessage({ kind: 'error', message });
  }
}
