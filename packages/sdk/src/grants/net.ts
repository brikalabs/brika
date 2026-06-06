/**
 * `ctx.net.fetch` — hub-mediated HTTP request.
 *
 * Plugin code never reaches `globalThis.fetch` (Tier-2 lockdown removes it
 * from the realm anyway). All outbound HTTP goes through this grant, which:
 *   - enforces the host allow-list from the granted scope
 *   - applies the caller's timeout / retry policy
 *   - coalesces identical in-flight GETs (single-flight) per plugin
 *   - honours `Retry-After` on retryable status codes
 *   - threads the hub-side AbortSignal so a stuck request can be cancelled
 *
 * Wire payload mirrors `fetch(input, init)` minus the things we don't want
 * to expose: no streaming bodies, no custom Agents, no credential modes.
 */

import { defineGrant } from '@brika/grants';
import { z } from 'zod';

const HttpMethod = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

export const FetchArgsSchema = z
  .object({
    url: z.url(),
    method: HttpMethod.default('GET'),
    headers: z.record(z.string(), z.string()).optional(),
    /**
     * Outbound body cap at the schema level — short-circuits a
     * malicious plugin pushing a multi-GB string through the IPC
     * decode before the per-call response cap can reject it. 16 MiB
     * is a generous ceiling for typical API calls; tighten via the
     * hub's `maxFileBytes` analogue if you need a stricter policy.
     */
    body: z
      .string()
      .max(16 * 1024 * 1024)
      .optional(),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(5 * 60_000)
      .optional(),
    singleFlight: z.boolean().optional(),
    idempotencyKey: z.string().max(256).optional(),
    retry: z
      .object({
        maxAttempts: z.number().int().min(1).max(10),
        respectRetryAfter: z.boolean().default(true),
        backoffMs: z.number().int().min(0).max(60_000),
      })
      .optional(),
    /**
     * Hard cap on response-body bytes. The hub streams the body and aborts
     * as soon as the cap is crossed — a hostile server can't make the hub
     * buffer an unbounded response. Defaults at the host side
     * (`DEFAULT_MAX_RESPONSE_BYTES`) when omitted; operators can lower the
     * ceiling, plugins can lower further per-call.
     */
    maxResponseBytes: z
      .number()
      .int()
      .positive()
      .max(256 * 1024 * 1024)
      .optional(),
    /**
     * Max redirect hops to follow. Set to 0 to refuse all redirects (the
     * caller will see the raw 3xx). Each hop revalidates the new host
     * against the allow-list, so the cap is also a defense in depth against
     * open-redirect chains.
     */
    maxRedirects: z.number().int().min(0).max(10).optional(),
  })
  // Refuse `body` on GET / HEAD: RFC 7231 §4.3.1-2 says either method has no
  // defined semantics for a payload, and accepting one creates a real bug —
  // the single-flight cache keys on method + url + headers, so two GETs
  // with different bodies would coalesce and share a response.
  .refine((args) => !(args.body !== undefined && BODYLESS_METHODS.has(args.method)), {
    error: '`body` is not allowed on GET / HEAD requests',
    path: ['body'],
  });

export const FetchResultSchema = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  attempts: z.number().int().positive(),
});

export type FetchArgs = z.infer<typeof FetchArgsSchema>;
export type FetchResult = z.infer<typeof FetchResultSchema>;

export const NetScopeSchema = z.object({
  /**
   * List of allowed host patterns. A literal host matches itself; the form
   * `*.suffix` matches any sub-domain (but NOT the bare suffix — that
   * must be listed explicitly). No wildcards anywhere else.
   */
  allow: z.array(z.string()),
});

export type NetScope = z.infer<typeof NetScopeSchema>;

/**
 * Spec-only export. The hub-side handler is bound in
 * `apps/hub/src/runtime/plugins/grants/net.ts` via
 * `defineGrant(netFetch.spec, realHandler)`. The placeholder below throws
 * to make accidental SDK-side dispatch (e.g. in tests with no hub)
 * obvious instead of returning bogus data.
 */
/** Header names whose VALUES are redacted in the audit log. */
const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

function redactHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '<redacted>' : v;
  }
  return out;
}

export const netFetch = defineGrant(
  {
    id: 'dev.brika.net.fetch',
    args: FetchArgsSchema,
    result: FetchResultSchema,
    permission: {
      name: 'net',
      scope: NetScopeSchema,
      defaultScope: { allow: [] },
      icon: 'globe',
    },
    description: 'Make HTTP requests to allow-listed hosts',
    redact: {
      args: (args) => ({
        url: args.url,
        method: args.method,
        headers: redactHeaders(args.headers),
        bodyBytes: args.body === undefined ? 0 : args.body.length,
      }),
      result: (result) => ({
        status: result.status,
        statusText: result.statusText,
        headers: redactHeaders(result.headers),
        bodyBytes: result.body.length,
        attempts: result.attempts,
      }),
    },
  },
  () => {
    throw new Error(
      'net.fetch: SDK-side handler invoked — the hub must rebind this spec with a real handler before dispatch.'
    );
  }
);

declare module '../ctx' {
  interface Ctx {
    net: {
      fetch(args: FetchArgs): Promise<FetchResult>;
    };
  }
}

/**
 * Scope for the raw-socket capability. There is nothing to parameterise:
 * granting it opens the door to direct UDP/TCP, so the scope is an empty
 * object (consent is the whole decision). Modelled the same way as the
 * location / secrets always-empty scopes.
 */
export const NetSocketScopeSchema = z.object({});

export type NetSocketScope = z.infer<typeof NetSocketScopeSchema>;

/**
 * `dev.brika.net.socket` — direct raw-socket capability.
 *
 * Unlike every other grant, this one is NOT dispatched over IPC and has no
 * `ctx.*` surface. A request/response broker cannot model a long-lived,
 * bidirectional UDP/TCP socket (e.g. Matter's mDNS multicast on 5353), so
 * raw sockets are realised at the sandbox LOCKDOWN layer instead: when this
 * grant is present and consented, the hub forwards `BRIKA_PLUGIN_RAW_SOCKETS=1`
 * and the prelude leaves `Bun.connect/listen/udpSocket` + `node:net/tls/dgram/dns`
 * intact so the plugin opens sockets itself, in-process.
 *
 * It lives in the grant registry purely so it rides the existing manifest +
 * consent machinery: the operator approves "raw socket access" with the same
 * toggle UX as any other family, rather than via a bespoke manifest boolean.
 * The handler throws because it must never be reached — the capability is the
 * lockdown opt-out, not a call. This mirrors `location` / `secrets`, whose
 * spec handlers are likewise never invoked (they dispatch via dedicated RPCs).
 */
export const netSocket = defineGrant(
  {
    id: 'dev.brika.net.socket',
    args: z.object({}),
    result: z.object({}),
    permission: {
      name: 'rawSocket',
      scope: NetSocketScopeSchema,
      defaultScope: {},
      icon: 'ethernet-port',
    },
    description: 'Open raw TCP/UDP sockets directly (needed for wire protocols like Matter mDNS)',
  },
  () => {
    throw new Error(
      'net.socket: realised at the sandbox lockdown layer (raw-socket opt-in), never dispatched over IPC.'
    );
  }
);
