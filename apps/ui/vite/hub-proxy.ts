import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Single Vite plugin that proxies the brika hub API end-to-end:
 *
 *   • Normal HTTP requests use Vite's built-in `server.proxy` (set via the
 *     `config` hook), which is fast and well-tested.
 *   • Server-Sent Events (`Accept: text/event-stream`) are intercepted by an
 *     earlier middleware that fetch-and-pipes the upstream directly. Vite's
 *     underlying `http-proxy` buffers chunked responses and 500s on long-lived
 *     SSE connections — going around it keeps EventSource streams alive.
 *
 * Usage in `vite.config.ts`:
 *
 *   plugins: [hubProxy('http://127.0.0.1:3001')],
 */
export function hubProxy(target: string, prefix = '/api'): Plugin {
  return {
    name: 'hub-proxy',
    config() {
      return {
        server: {
          proxy: {
            [prefix]: {
              target,
              changeOrigin: true,
            },
          },
        },
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix) || !req.headers.accept?.includes('text/event-stream')) {
          next();
          return;
        }
        handleSseRequest(target, req, res).catch(() => res.end());
      });
    },
  };
}

async function handleSseRequest(
  target: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const upstream = await fetch(`${target}${req.url}`, {
      method: req.method,
      headers: pickForwardableHeaders(req.headers),
    });
    res.statusCode = upstream.status;
    upstream.headers.forEach((v, k) => {
      res.setHeader(k, v);
    });
    res.flushHeaders();
    if (!upstream.body) {
      res.end();
      return;
    }
    await pipeReaderToResponse(upstream.body.getReader(), req, res);
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[hub-proxy] SSE fetch failed for ${req.url}: ${message}`);
    if (res.headersSent) {
      res.end();
    } else {
      res.statusCode = 502;
      res.end(message);
    }
  }
}

/**
 * Hop-by-hop headers (RFC 7230 §6.1) plus a few headers that `fetch` insists
 * on setting itself. Forwarding any of these confuses undici — it'll either
 * reject the request outright or send a malformed upstream call, both of
 * which surface to the browser as a 502.
 */
const STRIPPED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function pickForwardableHeaders(src: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(src)) {
    if (STRIPPED_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === 'string') {
        out[key] = first;
      }
    }
  }
  return out;
}

async function pipeReaderToResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const cancelOnClose = () => {
    reader.cancel().catch(() => undefined);
  };
  req.on('close', cancelOnClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(value);
    }
  } finally {
    req.off('close', cancelOnClose);
    res.end();
  }
}
