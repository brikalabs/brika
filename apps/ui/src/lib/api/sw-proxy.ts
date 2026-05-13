/**
 * Service-worker proxy bridge.
 *
 * When the UI is loaded via the remote-access bootstrap, `import()`
 * calls for plugin/brick modules at `/api/bricks/modules/...` go
 * through the browser's module loader → SW → cache miss → network →
 * SPA-fallback HTML on the CF Worker. The bootstrap can't pre-cache
 * those modules because they're loaded on-demand based on the board's
 * brick instances.
 *
 * Our SW (`apps/signaling-bootstrap/public/sw.js`) detects `/api/*`
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

export function installSwProxyListener(transport: Transport): void {
  if (installed) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
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
    void handleProxiedRequest(transport, data, port);
  });
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
