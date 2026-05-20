/**
 * Network capability.
 *
 * One operation today — `ctx.net.fetch` — that performs an HTTP request from
 * the hub on behalf of the plugin. Plugins lose direct access to raw fetch
 * in T2 (when the prelude freezes `globalThis.fetch`); this is the single
 * chokepoint that survives.
 *
 * The hub enforces the per-plugin host allowlist from the grant scope, a
 * default 30s deadline (overridable per call up to 5 minutes), and returns
 * a serialized response. Streaming, websockets, and binary payloads are
 * deliberately deferred — adding them is one schema change here plus a
 * matching hub handler, no plugin API churn.
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

const NetMethod = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const RetryPolicy = z.object({
  /** Maximum attempts including the first try. 1 = no retry, max 10. */
  maxAttempts: z.number().int().min(1).max(10).default(3),
  /**
   * Honor the upstream's `Retry-After` header on 429/503 responses. The
   * value is capped at the call's overall deadline. Defaults to true.
   */
  respectRetryAfter: z.boolean().default(true),
  /**
   * Base backoff between attempts in milliseconds. Doubles each retry,
   * capped at 30s. Jittered by ±25% to avoid thundering herds.
   */
  backoffMs: z.number().int().positive().default(500),
});

const NetFetchArgs = z.object({
  url: z.string().url(),
  method: NetMethod.default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  /** Per-call deadline in milliseconds. Capped at 300000 (5 min) by the hub. */
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  /**
   * Coalesce concurrent identical GET/HEAD requests (same url + headers)
   * into one in-flight call. Defaults to true for GET/HEAD, ignored for
   * other methods (POST/PUT/PATCH/DELETE are never coalesced).
   */
  singleFlight: z.boolean().optional(),
  /**
   * Idempotency key. Required by the retry policy for non-idempotent
   * methods (POST/PATCH); without it, retries on those methods are
   * refused at the handler to avoid duplicate side-effects. Forwarded
   * upstream as the `Idempotency-Key` header.
   */
  idempotencyKey: z.string().optional(),
  /** Optional retry policy. Omit for no retries (the default). */
  retry: RetryPolicy.optional(),
});

const NetFetchResult = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  /** Number of attempts the hub made before returning this response. */
  attempts: z.number().int().min(1).default(1),
});

export const netFetch = defineCapability(
  {
    id: 'dev.brika.net.fetch',
    ctxPath: 'net.fetch',
    args: NetFetchArgs,
    result: NetFetchResult,
    description: 'Make HTTP requests to allow-listed hosts',
    permission: {
      name: 'net',
      scope: z.object({
        /**
         * Host patterns the plugin may request. Supports literal hosts
         * (`api.spotify.com`) and one-level wildcards (`*.googleapis.com`).
         * Empty array = grant exists but matches nothing (no calls allowed).
         */
        allow: z.array(z.string()).default([]),
      }),
      defaultScope: { allow: [] },
      icon: 'globe',
    },
  },
  () => {
    throw new Error(
      'net.fetch handler is not registered. The hub must register a handler before plugin code can call ctx.net.fetch().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    net: {
      /**
       * Make an HTTP request through the hub.
       *
       * The hub enforces the per-plugin host allowlist; calls to a host
       * outside the grant scope reject with `PERMISSION_DENIED` regardless
       * of whether the URL is otherwise valid.
       *
       * Requests time out after 30s by default. Override per-call via
       * `timeoutMs` up to 5 minutes; longer requests are rejected at the
       * spec validation layer.
       */
      fetch(args: z.input<typeof NetFetchArgs>): Promise<z.infer<typeof NetFetchResult>>;
    };
  }
}
