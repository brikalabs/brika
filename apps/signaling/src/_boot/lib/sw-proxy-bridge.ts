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
 * BEFORE scripts are injected. The hub UI's own listener takes over
 * later via the `installed` guard in sw-proxy.ts.
 *
 * Lifecycle: the WebRTC peer is the bootstrap's; it survives across
 * the `injectGraph` swap because the document context is preserved
 * (only #root and head links change). When the user navigates or the
 * peer closes, the bridge stops responding — the bootstrap's lifecycle
 * IS the bridge's lifecycle.
 */

import type { PeerHandle } from './peer';

interface ProxyRequest {
  readonly type: 'brika:sw-proxy';
  readonly url: string;
  readonly method: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly body: ArrayBuffer | null;
}

let installed = false;

const log = (...args: unknown[]): void => console.log('[brika-boot-proxy]', ...args);

/**
 * Install the bootstrap's primordial SW-proxy listener. Idempotent:
 * calling more than once is a no-op (the hub UI's later
 * `installSwProxyListener` call is guarded the same way).
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

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as ProxyRequest | undefined;
    if (data?.type !== 'brika:sw-proxy') {
      return;
    }
    const port = event.ports[0];
    if (!port) {
      return;
    }
    void handleProxiedRequest(peer, data, port);
  });

  notifyReady('install');
  // Re-announce on controllerchange (a new SW takes over after activate
  // → claim; the SW's `proxyReadyClients` is cleared, so we have to
  // re-tell it we're listening).
  navigator.serviceWorker.addEventListener('controllerchange', () =>
    notifyReady('controllerchange')
  );
}

function notifyReady(trigger: string): void {
  const controller = navigator.serviceWorker.controller;
  log('notifyReady', { trigger, hasController: !!controller });
  controller?.postMessage({ type: 'BRIKA_PROXY_READY' });
}

/**
 * Strip Vite's optimizer cache-buster (`?v=<hash>`) before forwarding
 * upstream. Vite rotates this hash whenever its dep graph changes; once
 * rotated, requests with the OLD hash return **504 Outdated Optimize
 * Dep** from Vite, not 404 — so a cached entry script that references
 * `react.js?v=OLD` would have every transitive import 504 forever, even
 * though `react.js` (no query) still serves fine.
 *
 * The hash is purely a Vite-side optimization marker — file content
 * doesn't depend on it. Stripping makes the bridge robust against the
 * common dev-server-restart-while-bootstrap-is-cached scenario.
 *
 * Production hubs don't use `?v=` for assets, so this is a no-op there.
 */
function stripViteHashQuery(url: string): string {
  if (!url.includes('?v=')) {
    return url;
  }
  try {
    const u = new URL(url, 'http://x');
    u.searchParams.delete('v');
    return u.pathname + (u.search.length > 0 ? u.search : '');
  } catch {
    return url;
  }
}

async function handleProxiedRequest(
  peer: PeerHandle,
  data: ProxyRequest,
  port: MessagePort
): Promise<void> {
  try {
    // peer.request only supports method+url (no body, no headers).
    // That's fine for static-asset fetches the browser issues for
    // ES-module loading and CSS — they're all GETs with default
    // request headers the hub's Vite proxy generates itself.
    const forwardUrl = stripViteHashQuery(data.url);
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
    port.postMessage({
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
