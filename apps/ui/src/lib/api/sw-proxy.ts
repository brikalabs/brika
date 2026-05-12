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
    const buf = await res.arrayBuffer();
    const respHeaders: Array<[string, string]> = [];
    res.headers.forEach((v, k) => respHeaders.push([k, v]));
    port.postMessage(
      {
        status: res.status,
        headers: respHeaders,
        body: buf,
      },
      [buf]
    );
  } catch (err) {
    port.postMessage({
      status: 502,
      headers: [['content-type', 'text/plain']],
      body: new TextEncoder().encode(
        `Bridge proxy failed: ${err instanceof Error ? err.message : String(err)}`
      ).buffer,
    });
  }
}
