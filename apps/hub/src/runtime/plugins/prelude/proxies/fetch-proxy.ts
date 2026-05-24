/**
 * `globalThis.fetch` proxy on top of the `dev.brika.net.fetch` grant.
 *
 * Plugin authors writing `fetch('https://api.example.com')` get the same
 * security boundary as `ctx.net.fetch({...})` — the hub enforces the
 * allow-list, DNS, redirect, and body cap policies — without learning a
 * new API. The grant is the single source of truth; this file is pure
 * adapter.
 *
 * What's translated:
 *   - `Request | URL | string` input → `args.url`
 *   - `init.method` / `init.headers` / `init.body` → equivalent FetchArgs
 *   - the grant result `{status, statusText, headers, body}` → `Response`
 *
 * What's NOT translated (silently ignored; documented in the plan):
 *   - `credentials`, `mode`, `cache`, `referrerPolicy`, `integrity`,
 *     `keepalive`, `priority`, `referrer` — server-side fetch has no
 *     meaningful interpretation. We log once per process if a plugin
 *     passes any of these so authors notice.
 *
 * What about `signal`?
 *   - v1 does not forward plugin-side AbortSignal through IPC. The hub
 *     already runs the fetch under its own watchdog signal (timeout +
 *     shutdown), so security-relevant cancellation always works; the
 *     missing piece is plugin-driven cancellation, which is purely a
 *     resource hint. A future Channel.call signal extension would close
 *     this gap.
 */

import type { Channel } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import { type FetchArgs, type FetchResult, FetchResultSchema } from '@brika/sdk/grants';

/** Grant id the proxy routes through. Matches the SDK spec. */
const NET_FETCH_GRANT_ID = 'dev.brika.net.fetch';

/** init options the grant doesn't model — silently dropped, logged once each. */
const UNMODELED_INIT_KEYS = [
  'credentials',
  'mode',
  'cache',
  'referrerPolicy',
  'integrity',
  'keepalive',
  'priority',
  'referrer',
] as const;

export interface FetchProxyDeps {
  readonly channel: Channel;
  /** Optional: called once per ignored init key the plugin uses. */
  readonly onUnmodeled?: (key: string) => void;
}

/**
 * Shape we expose. The runtime function plus the `preconnect` no-op
 * required to satisfy Bun's `typeof fetch` at the install site. The
 * preconnect hint is purely advisory in browsers; ignoring it is the
 * correct server-side stance.
 */
export type FetchProxy = ((
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>) & {
  preconnect: (url: string) => void;
};

/**
 * Build a `globalThis.fetch`-shaped proxy. Returned function is safe to
 * install via `swapInProxy('globalThis', 'fetch', proxy)`.
 */
export function buildFetchProxy(deps: FetchProxyDeps): FetchProxy {
  const warned = new Set<string>();
  const warn = (key: string) => {
    if (warned.has(key)) {
      return;
    }
    warned.add(key);
    deps.onUnmodeled?.(key);
  };

  const proxy = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init) {
      reportUnmodeled(init, warn);
    }
    const args = await buildArgsFromInit(input, init);
    const result = await callGrant(deps.channel, args);
    return shapeResponse(result);
  };

  // `Object.assign` returns the merged type so the result narrows to
  // `FetchProxy` without any `as` cast. `preconnect` is intentionally a
  // no-op: the hint is a browser-only optimisation and has no meaning
  // server-side. We assign a named function so the empty body doesn't
  // trip biome's `noEmptyBlockStatements`.
  return Object.assign(proxy, { preconnect: preconnectNoop });
}

function preconnectNoop(_url: string): void {
  // Intentionally empty — preconnect is advisory; ignoring is correct
  // from a server-side stance.
}

const UNMODELED_INIT_KEY_SET: ReadonlySet<string> = new Set(UNMODELED_INIT_KEYS);

/**
 * Notify (once per key) for init options the grant doesn't model.
 * Iterates the init's own enumerable entries via `Object.entries` so we
 * never need an index signature against `RequestInit` (whose declared
 * literal-union keys don't admit string indexing).
 */
function reportUnmodeled(init: RequestInit, warn: (key: string) => void): void {
  for (const [key, value] of Object.entries(init)) {
    if (value !== undefined && UNMODELED_INIT_KEY_SET.has(key)) {
      warn(key);
    }
  }
}

/**
 * Normalize `input + init` into the wire-shaped `FetchArgs`. The grant
 * schema validates again on the hub side; this just gathers the inputs.
 */
async function buildArgsFromInit(
  input: string | URL | Request,
  init: RequestInit | undefined
): Promise<FetchArgs> {
  if (input instanceof Request) {
    return await argsFromRequest(input, init);
  }
  const url = typeof input === 'string' ? input : input.href;
  return argsFromInit(url, init);
}

async function argsFromRequest(req: Request, init: RequestInit | undefined): Promise<FetchArgs> {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  // init may override fields on the Request; mirror standard fetch
  // semantics (init wins).
  const method = (init?.method ?? req.method).toUpperCase();
  const body =
    (await readInitBody(init?.body)) ?? (canHaveBody(method) ? await req.text() : undefined);
  return {
    url: req.url,
    method: castMethod(method),
    headers: { ...headers, ...headersFromInit(init) },
    body,
  };
}

function argsFromInit(url: string, init: RequestInit | undefined): FetchArgs {
  const method = castMethod((init?.method ?? 'GET').toUpperCase());
  const headers = headersFromInit(init);
  const body = canHaveBody(method) ? extractStringBody(init?.body) : undefined;
  return { url, method, headers: Object.keys(headers).length > 0 ? headers : undefined, body };
}

// Typed as `Set<string>` (rather than `Set<FetchArgs['method']>`) so the
// membership check accepts any input the plugin's RequestInit hands us.
// The narrowing to the literal union happens in `isAllowedMethod` below
// via a type predicate, avoiding an `as` cast at the call site.
const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

function castMethod(m: string): FetchArgs['method'] {
  if (isAllowedMethod(m)) {
    return m;
  }
  // The schema would reject this; failing here with a clear message is
  // friendlier than a generic INVALID_INPUT from the grant.
  throw new TypeError(`fetch: unsupported method "${m}"`);
}

function isAllowedMethod(m: string): m is FetchArgs['method'] {
  return ALLOWED_METHODS.has(m);
}

function canHaveBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

function headersFromInit(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers;
  if (!h) {
    return out;
  }
  if (h instanceof Headers) {
    h.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const pair of h) {
      const [key, value] = pair;
      if (typeof key === 'string' && typeof value === 'string') {
        out[key] = value;
      }
    }
    return out;
  }
  // Plain object form.
  for (const [key, value] of Object.entries(h)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The grant only models string bodies. Streams, FormData, and Blob
 * crossings are out of v1 scope — readInitBody returns undefined in
 * those cases, and the call site falls back to undefined (so the request
 * goes with no body). Plugin authors needing those shapes should use
 * `ctx.net.fetch` directly until streaming lands in v2.
 *
 * We type the input as `unknown` because the global `BodyInit` type
 * isn't available across all Bun/TS target combinations, and the
 * declared `RequestInit['body']` type adds nothing — every branch below
 * is a runtime check anyway.
 */
/**
 * Async signature is kept (rather than `function readInitBody(...): string | undefined`)
 * so the call sites can `await` without changing once we add Blob/stream
 * support. Until then the implementation is synchronous.
 */
function readInitBody(body: unknown): Promise<string | undefined> {
  return Promise.resolve(extractStringBody(body));
}

function extractStringBody(body: unknown): string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof URLSearchParams) {
    // Aliased through a typed local so sonar S6551 sees the
    // URLSearchParams.toString() resolution explicitly rather than
    // suspecting Object's default `[object Object]` form.
    const params: URLSearchParams = body;
    return params.toString();
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof Uint8Array) {
    // Narrow to Uint8Array specifically rather than the broader
    // ArrayBuffer.isView() check — TextDecoder.decode's typings reject
    // the wider `ArrayBufferView<ArrayBufferLike>` shape but accept
    // typed-array buffers directly.
    return new TextDecoder().decode(body);
  }
  // Streams / Blob / FormData not supported in v1 — silently drop. The
  // alternative (throwing) would break plugins that pass these
  // accidentally on an OPTIONS preflight, etc.
  return undefined;
}

async function callGrant(channel: Channel, args: FetchArgs): Promise<FetchResult> {
  const response = await channel.call(grantRequest, { id: NET_FETCH_GRANT_ID, args });
  // `grantRequest.result` is `unknown` on the wire — re-parse with the
  // grant's own schema so the proxy returns properly-typed data without
  // a cast. Costs one extra schema pass; cheap and worth the safety.
  return FetchResultSchema.parse(response.result);
}

function shapeResponse(result: FetchResult): Response {
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}
