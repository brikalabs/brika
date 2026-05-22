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
    body: z.string().optional(),
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
