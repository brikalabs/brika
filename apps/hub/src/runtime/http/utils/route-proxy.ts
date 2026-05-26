import type { Json } from '@brika/ipc';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { filterPluginResponseHeaders } from './header-allowlist';

const FORWARDED_HEADERS = [
  'content-type',
  'accept',
  'authorization',
  'user-agent',
  'host',
  'x-forwarded-proto',
];

/** Extract query params from a URL into a plain record. */
export function extractQuery(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    query[k] = v;
  }
  return query;
}

/** Pick relevant headers from a Request and add forwarding metadata. */
export function extractHeaders(req: Request, url: URL, pluginUid: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const key of FORWARDED_HEADERS) {
    const val = req.headers.get(key);
    if (val) {
      headers[key] = val;
    }
  }
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  }
  headers['x-plugin-uid'] = pluginUid;
  return headers;
}

/**
 * Parse the request body for non-GET/HEAD methods.
 *
 * - `application/json` → parsed JSON value.
 * - `application/x-www-form-urlencoded` → parsed as JSON-safe object.
 * - Everything else with a body (binary uploads, octet-stream, image/*,
 *   multipart/*) → raw `Uint8Array`. The plugin's route handler inspects
 *   `headers['content-type']` to drive multipart parsing or treat the
 *   bytes as the file body directly.
 */
export async function extractBody(
  req: Request
): Promise<Json | Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return (await req.json()) as Json;
    } catch {
      return undefined;
    }
  }
  try {
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return undefined;
    }
    return new Uint8Array(buf);
  } catch {
    return undefined;
  }
}

/** Forward a route request to a plugin process and build a Response. */
export async function proxyToPlugin(
  process: PluginProcess,
  routeId: string,
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  body?: Json | Uint8Array<ArrayBuffer>
): Promise<Response> {
  // Track the round-trip cost so the operator can see in DevTools (or via
  // `curl -i`) where time was spent. The plugin handler runs inside a
  // child process; everything from the IPC `routeRequest` send to the
  // RouteResponse return is `plugin;dur=…`. The browser exposes this as
  // a `Server-Timing` entry under the request in the Network tab.
  const start = performance.now();
  const result = await process.sendRouteRequest(routeId, method, path, query, headers, body);
  const pluginMs = performance.now() - start;

  // Filter plugin-supplied headers against a strict allowlist. Without
  // this, a plugin could set Set-Cookie, CSP overrides, Location on a
  // non-3xx response, Authorization, etc. — and undermine the hub UI
  // served from the same origin. Anything outside the allowlist is dropped.
  const safeHeaders = filterPluginResponseHeaders(result.headers, result.status);
  // Server-Timing is safe to surface — only durations, no plugin-supplied
  // data. Round to 0.1ms to keep the header readable.
  safeHeaders['server-timing'] = `plugin;dur=${pluginMs.toFixed(1)}`;

  // Binary responses pass through verbatim. The plugin sets the media type
  // via `headers['content-type']`; if omitted we fall back to the generic
  // octet-stream rather than mis-declaring as JSON.
  if (result.body instanceof Uint8Array) {
    if (!safeHeaders['content-type']) {
      safeHeaders['content-type'] = 'application/octet-stream';
    }
    return new Response(result.body, {
      status: result.status,
      headers: safeHeaders,
    });
  }

  let responseBody: string | null = null;
  if (result.body !== null && result.body !== undefined) {
    responseBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
  }
  if (!safeHeaders['content-type']) {
    safeHeaders['content-type'] = 'application/json';
  }

  return new Response(responseBody, {
    status: result.status,
    headers: safeHeaders,
  });
}
