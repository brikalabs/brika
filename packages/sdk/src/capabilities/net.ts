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

const NetFetchArgs = z.object({
  url: z.string().url(),
  method: NetMethod.default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  /** Per-call deadline in milliseconds. Capped at 300000 (5 min) by the hub. */
  timeoutMs: z.number().int().positive().max(300_000).optional(),
});

const NetFetchResult = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

export const netFetch = defineCapability(
  {
    id: 'net.fetch',
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
