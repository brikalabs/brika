/**
 * Dev-mode UI proxy.
 *
 * When `BRIKA_DEV_UI_PROXY` is set, the hub forwards every non-`/api/*`
 * request (HTTP and WebSocket) to an upstream dev server — typically Vite
 * at `http://localhost:5173`. Lets developers open `localhost:7878` and
 * iterate on the UI without rebuilding the static bundle, with HMR working
 * through the same hostname.
 *
 * This whole module is dev-only. Production hub binaries either serve the
 * embedded archive baked into the binary OR a sidecar `staticDir`; the
 * proxy never runs in those code paths.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';

/**
 * Logger callback shape we depend on. Matches the hub's `Logger.warn`
 * signature without coupling this dev-only module to the logger package.
 * Strings, numbers, booleans, and null are the only payload primitives the
 * proxy currently emits.
 */
type LogWarn = (msg: string, ctx: Record<string, string | number | boolean | null>) => void;

/**
 * Bun's fetch wraps the underlying socket error in a generic "fetch failed"
 * Error whose `.cause` carries the real signal (ECONNRESET, ETIMEDOUT,
 * ENOTFOUND, etc.). Pull that through cleanly so the log line in mortar
 * names the actual failure mode instead of just "fetch failed".
 */
function extractCauseMessage(err: unknown): string | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const { cause } = err;
  if (cause === null || cause === undefined) {
    return null;
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  return null;
}

export interface ProxyWsData {
  outbound: WebSocket;
}

/**
 * Build a Hono middleware that proxies every non-`/api/*` request to the
 * given target origin. Used to serve Vite's HTTP responses through the hub.
 */
export function devUiProxyMiddleware(target: string, logWarn: LogWarn): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    if (c.req.path.startsWith('/api/')) {
      await next();
      return undefined;
    }
    const queryStart = c.req.url.indexOf('?');
    const search = queryStart === -1 ? '' : c.req.url.slice(queryStart);
    const upstreamUrl = `${target}${c.req.path}${search}`;
    const outHeaders = new Headers(c.req.raw.headers);
    outHeaders.delete('host');
    outHeaders.delete('connection');
    // Buffer the body once so a retry can re-send it. fetch() consumes
    // the stream on the first attempt — a second call against the raw
    // body throws "stream already locked".
    const reqBody =
      c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.raw.arrayBuffer();
    // Single retry covers Bun's known concurrent-fetch-to-localhost
    // failure mode: under a burst of ~10+ in-flight upstream fetches,
    // a fraction reject with ECONNRESET / "fetch failed" while the TCP
    // listen backlog drains. The retry fires ~50 ms later when the
    // queue has caught up; happy-path attempts pay nothing.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(upstreamUrl, {
          method: c.req.method,
          headers: outHeaders,
          body: reqBody,
          redirect: 'manual',
        });
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
      } catch (err) {
        lastErr = err;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }
    logWarn('Dev UI proxy failed', {
      target,
      path: c.req.path,
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      cause: extractCauseMessage(lastErr),
    });
    return c.text(
      `Dev UI proxy could not reach ${target}. Is your UI dev server running?\n\n${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      502
    );
  };
}

/**
 * Open an outbound WebSocket to {@link target}, wait for it to be ready,
 * then upgrade the inbound request via `server.upgrade()`. Returns
 * `undefined` (success — Bun emits the 101) or a `Response` on failure.
 */
export async function proxyWebSocketUpgrade(
  req: Request,
  server: Bun.Server<ProxyWsData>,
  target: string,
  logWarn: LogWarn
): Promise<Response | undefined> {
  const sourceUrl = new URL(req.url);
  const targetUrl = new URL(target);
  targetUrl.pathname = sourceUrl.pathname;
  targetUrl.search = sourceUrl.search;
  targetUrl.protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  const protocols = req.headers
    .get('sec-websocket-protocol')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let outbound: WebSocket;
  try {
    outbound = new WebSocket(targetUrl.toString(), protocols);
  } catch (err) {
    logWarn('Dev UI WS proxy failed to dial upstream', {
      target: targetUrl.toString(),
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response('Bad upstream', { status: 502 });
  }

  const opened = await waitForUpstreamOpen(outbound);
  if (!opened) {
    closeQuietly(outbound);
    return new Response('Upstream WebSocket did not open in time', { status: 504 });
  }

  const upgraded = server.upgrade(req, { data: { outbound } });
  if (!upgraded) {
    closeQuietly(outbound);
    return new Response('Upgrade failed', { status: 426 });
  }
  return undefined;
}

function waitForUpstreamOpen(ws: WebSocket): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const settle = (ok: boolean): void => {
      cleanup();
      resolve(ok);
    };
    const onOpen = (): void => settle(true);
    const onError = (): void => settle(false);
    const timer = setTimeout(() => settle(false), 3000);
    function cleanup(): void {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      clearTimeout(timer);
    }
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
  });
}

function closeQuietly(ws: { close(): void }): void {
  try {
    ws.close();
  } catch {
    /* already torn down */
  }
}

/**
 * The Bun.serve `websocket` handler that runs for every inbound socket the
 * proxy upgrades. Forwards messages each way and propagates closes.
 */
export const proxyWebSocketHandlers: Bun.WebSocketHandler<ProxyWsData> = {
  open: (ws) => {
    const { outbound } = ws.data;
    outbound.addEventListener('message', (ev) => {
      try {
        if (typeof ev.data === 'string') {
          ws.send(ev.data);
        } else if (ev.data instanceof ArrayBuffer) {
          ws.send(new Uint8Array(ev.data));
        }
      } catch {
        /* downstream peer already closed */
      }
    });
    outbound.addEventListener('close', (ev) => {
      try {
        ws.close(ev.code || 1000, ev.reason);
      } catch {
        /* already closed */
      }
    });
    outbound.addEventListener('error', () => {
      try {
        ws.close(1011, 'upstream errored');
      } catch {
        /* already closed */
      }
    });
  },
  message: (ws, message) => {
    const out = ws.data.outbound;
    if (out.readyState === WebSocket.OPEN) {
      out.send(message as string | Uint8Array);
    } else if (out.readyState === WebSocket.CONNECTING) {
      out.addEventListener('open', () => out.send(message as string | Uint8Array), {
        once: true,
      });
    }
  },
  close: (ws) => {
    closeQuietly(ws.data.outbound);
  },
};
