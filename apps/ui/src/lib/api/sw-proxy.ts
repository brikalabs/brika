/**
 * Service-worker proxy bridge.
 *
 * When the UI is loaded via the remote-access bootstrap, `import()`
 * calls for plugin client modules at `/api/modules/...` go
 * through the browser's module loader → SW → cache miss → network →
 * SPA-fallback HTML on the CF Worker. The bootstrap can't pre-cache
 * those modules because they're loaded on-demand based on the board's
 * brick instances.
 *
 * Our SW (`apps/signaling/public/sw.js`) detects `/api/*`
 * requests and posts a `brika:sw-proxy` message to the controlling
 * page with a `MessagePort` for the reply. This module is that
 * listener: it accepts the proxied request, runs it through the
 * `DataChannelTransport` (same path as in-app `apiFetch` calls), and
 * sends the response — including the streamed binary body — back to
 * the SW so it can return it to the original fetch.
 */
import type { Transport } from './transport';

interface ProxyRequest {
  type: 'brika:sw-proxy';
  url: string;
  method: string;
  headers: Array<[string, string]>;
  body: ArrayBuffer | null;
}

let installed = false;

const log = (...args: unknown[]): void => console.log('[brika-sw-proxy]', ...args);

export function installSwProxyListener(transport: Transport): void {
  log('install called', { alreadyInstalled: installed });
  if (installed) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    log('install skipped — no navigator.serviceWorker');
    return;
  }
  installed = true;
  // Hand off from the bootstrap's primordial listener BEFORE we add our
  // own. Both listeners on the same `navigator.serviceWorker` would
  // fire for every SW message and race to post to the same MessagePort
  // — first frame wins, the loser writes to a closed writable and
  // surfaces as random "Cannot write to a CLOSED writable stream" plus
  // truncated/corrupted responses. The bootstrap publishes
  // `__brikaBootProxyUninstall` on globalThis; calling it removes its
  // message + controllerchange listeners. Once gone, only ours answers.
  const bootUninstall = (globalThis as { __brikaBootProxyUninstall?: () => void })
    .__brikaBootProxyUninstall;
  bootUninstall?.();
  navigator.serviceWorker.addEventListener('message', (event) => {
    // Drop cross-origin postMessage attempts before touching `event.data`.
    // The SW is same-origin by browser policy, but an anomalous origin
    // value means an intermediary or hostile context is forging events.
    const expectedOrigin = globalThis.location.origin;
    if (event.origin !== expectedOrigin && event.origin !== '') {
      return;
    }
    const data = event.data as ProxyRequest | undefined;
    if (data?.type !== 'brika:sw-proxy') {
      return;
    }
    const port = event.ports[0];
    if (!port) {
      return;
    }
    void handleProxiedRequest(transport, data, port);
  });
  // Tell the SW we're ready to receive proxied requests. Without this
  // the SW falls back to network for cache misses (it can't distinguish
  // a hub-UI document from the bare bootstrap document, which has no
  // listener and would just hang for 30s on every proxied message).
  notifySwReady('install');
  // A controller swap (new SW takes over after activation) loses the
  // ready-set, so re-announce.
  navigator.serviceWorker.addEventListener('controllerchange', () =>
    notifySwReady('controllerchange')
  );
}

function notifySwReady(trigger: string): void {
  const controller = navigator.serviceWorker.controller;
  log('notifySwReady', {
    trigger,
    hasController: !!controller,
    scriptURL: controller?.scriptURL ?? null,
  });
  controller?.postMessage({ type: 'BRIKA_PROXY_READY' });
}

async function handleProxiedRequest(
  transport: Transport,
  data: ProxyRequest,
  port: MessagePort
): Promise<void> {
  try {
    const headers = new Headers();
    for (const [k, v] of data.headers) {
      // Skip headers the browser already managed (sw forwards them
      // for completeness, but re-sending them through fetch can
      // duplicate or conflict).
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'content-length') {
        continue;
      }
      headers.append(k, v);
    }
    const init: RequestInit = { method: data.method, headers };
    if (data.body && data.method !== 'GET' && data.method !== 'HEAD') {
      init.body = data.body;
    }
    const res = await transport.fetch(data.url, init);
    // Stream chunks back through the MessagePort so SSE / long-poll /
    // text/event-stream responses don't hang waiting for `arrayBuffer()`
    // to consume an infinite body. The SW reconstructs a Response wrapping
    // a TransformStream and writes each chunk as it arrives.
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
          // Copy into a fresh ArrayBuffer so we can transfer it (the
          // Uint8Array might be a view over a shared buffer that the
          // browser still owns).
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
