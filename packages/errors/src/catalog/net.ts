/**
 * `ctx.net.fetch` error codes. Cover the hardened HTTP grant's
 * defences: host allow-list, protocol gate, DNS rebinding,
 * redirect chain checks, response body cap.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const NetCatalog = {
  /**
   * Per-grant denial when a `ctx.net.fetch` call targets a host outside
   * the permitted allow-list. `publicDataShape` redacts the full allow
   * list — the hub-side log keeps it, the plugin only sees its own
   * forbidden host so it can fix the call site without learning what
   * else the operator permitted.
   */
  NET_HOST_NOT_ALLOWED: entry({
    title: 'Network host not allowed',
    description: "A net.fetch call targeted a host outside the plugin's allow-list.",
    typeUri: `${TYPE_BASE}grants/net-host-not-allowed`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      "Add the host to the `allow` array under your manifest's `dev.brika.net.fetch` grant, then ask the operator to re-grant.",
    data: z.object({
      host: z.string(),
      // Full operator allow-list — kept in hub logs only.
      allow: z.array(z.string()),
    }),
    publicDataShape: z.object({ host: z.string() }),
    message: (data) => `net.fetch: host "${data.host}" is not in this plugin's allow list.`,
  }),
  /**
   * URL protocol other than `http:` or `https:`. Blocks SSRF via `file:`,
   * `data:`, `gopher:`, etc. The hostname check would have already failed
   * for some of these (empty hostname for `file:///…`) but an explicit
   * protocol gate gives a clear error and doesn't rely on URL parser
   * quirks for security.
   */
  NET_PROTOCOL_BLOCKED: entry({
    title: 'Network protocol blocked',
    description: 'A net.fetch call used a protocol other than http(s).',
    typeUri: `${TYPE_BASE}grants/net-protocol-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint: 'Only `http:` and `https:` are accepted by net.fetch. Switch the URL scheme.',
    data: z.object({ protocol: z.string() }),
    message: (data) => `net.fetch: protocol "${data.protocol}" is not allowed.`,
  }),
  /**
   * DNS resolved the request hostname to an IP in a forbidden range
   * (RFC1918, loopback, link-local, multicast, etc.). Closes DNS-rebinding
   * SSRF where an attacker-controlled domain points at internal space.
   */
  NET_PRIVATE_IP_BLOCKED: entry({
    title: 'Network target IP blocked',
    description: 'Hostname resolved to a private or restricted IP range.',
    typeUri: `${TYPE_BASE}grants/net-private-ip-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The DNS record for this host resolves to private address space. The hub blocks egress to internal networks regardless of allow-list.',
    data: z.object({
      host: z.string(),
      // The forbidden IP and its category — hub-side log only.
      ip: z.string(),
      category: z.string(),
    }),
    publicDataShape: z.object({ host: z.string() }),
    message: (data) => `net.fetch: host "${data.host}" resolves to a blocked IP range.`,
  }),
  /**
   * A 3xx response had a `Location` whose host is outside the allow-list.
   * Without this check, a permitted host could redirect a plugin to
   * internal endpoints — the original SSRF vector behind manual-redirect
   * handling.
   */
  NET_REDIRECT_BLOCKED: entry({
    title: 'Network redirect blocked',
    description: 'A redirect target was outside the allow-list.',
    typeUri: `${TYPE_BASE}grants/net-redirect-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      "A 3xx response pointed at a host that isn't in this plugin's allow-list. Either add the target host or stop the call at the redirect.",
    data: z.object({
      from: z.string(),
      to: z.string(),
      allow: z.array(z.string()),
    }),
    publicDataShape: z.object({ from: z.string(), to: z.string() }),
    message: (data) =>
      `net.fetch: redirect from "${data.from}" to "${data.to}" was blocked by the allow-list.`,
  }),
  /**
   * Too many redirect hops. Capped to prevent open-redirect chains and
   * pathological loops; the cap is intentionally lower than the platform
   * default (5 vs. 20) because every hop is also paying the host re-check.
   */
  NET_REDIRECT_LOOP: entry({
    title: 'Network redirect loop',
    description: 'A net.fetch call exceeded the maximum redirect hop count.',
    typeUri: `${TYPE_BASE}grants/net-redirect-loop`,
    status: 508,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The target chained more than the configured redirect hops. Investigate the upstream — this is almost always a misconfiguration on the remote side.',
    data: z.object({
      url: z.string(),
      hops: z.number().int().nonnegative(),
    }),
    publicDataShape: z.object({ hops: z.number().int().nonnegative() }),
    message: (data) =>
      `net.fetch: redirect chain exceeded ${data.hops} hops starting from "${data.url}".`,
  }),
  /**
   * Response body exceeded `maxResponseBytes`. Streamed read aborts the
   * underlying request as soon as the cap is hit so a hostile server can't
   * OOM the hub by sending an unbounded body to an allow-listed endpoint.
   */
  NET_BODY_TOO_LARGE: entry({
    title: 'Network body too large',
    description: 'Response body exceeded the configured maximum size.',
    typeUri: `${TYPE_BASE}grants/net-body-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The response exceeded the `maxResponseBytes` cap. Raise the cap on the call (within the operator-set ceiling) or fetch a smaller resource.',
    data: z.object({
      limit: z.number().int().positive(),
      received: z.number().int().nonnegative(),
    }),
    message: (data) =>
      `net.fetch: response body exceeded ${data.limit} bytes (read ${data.received} before aborting).`,
  }),
} as const;
