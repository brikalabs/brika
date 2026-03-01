import type { Json } from '@brika/ipc';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';

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

/** Parse the request body for non-GET/HEAD methods. */
export async function extractBody(req: Request): Promise<Json> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return undefined;
  }
  try {
    return (await req.json()) as Json;
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
  body?: Json
): Promise<Response> {
  const result = await process.sendRouteRequest(routeId, method, path, query, headers, body);

  const contentType =
    result.headers?.['Content-Type'] ?? result.headers?.['content-type'] ?? 'application/json';
  let responseBody: string | null = null;
  if (result.body !== null && result.body !== undefined) {
    responseBody = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
  }

  return new Response(responseBody, {
    status: result.status,
    headers: {
      'Content-Type': contentType,
      ...result.headers,
    },
  });
}
