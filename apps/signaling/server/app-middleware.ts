/**
 * Reusable route helpers + Hono middleware factories for the signaling app.
 *
 * Extracted from `app.ts` so the route definitions there read as a flat
 * sequence of concerns: `originGuard`, `rateLimitGate`, `requireOwnerOf`,
 * then the handler body. Keeps the per-route boilerplate down to one line
 * per pre-check.
 */

import { type Claim, ClaimError, type ClaimStore } from '@brika/remote-access-protocol';
import type { Context, MiddlewareHandler } from 'hono';
import type { RateBucket } from './rate-limit';

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['https://hub.brika.dev'];

/** Hono context variables set by the middleware below. */
export interface AppVariables {
  owner: Claim;
}

/** Origin allowlist check — passes any localhost + the configured list. */
export function originAllowed(
  req: Request,
  allowedOrigins: readonly string[] | undefined
): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    // CLI, server-to-server, same-origin GET — no Origin header. Allow.
    return true;
  }
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    // Malformed Origin → fall through to explicit allowlist check.
  }
  return (allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS).includes(origin);
}

export function bearerFromAuthHeader(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

export function claimErrorStatus(code: ClaimError['code']): 400 | 401 | 403 | 404 | 409 {
  switch (code) {
    case 'invalid-name':
      return 400;
    case 'reserved':
      return 403;
    case 'taken':
      return 409;
    case 'unauthorized':
      return 401;
    default:
      return 404;
  }
}

/**
 * Run `handler` and map any `ClaimError` it throws to its mapped HTTP
 * status. Non-ClaimError exceptions bubble (Hono's outer handler turns
 * them into 500s).
 */
export async function handleClaimErrors(
  c: Context,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof ClaimError) {
      return c.json({ error: err.message, code: err.code }, claimErrorStatus(err.code));
    }
    throw err;
  }
}

/** Reject cross-origin requests outside the allowlist with 403. */
export function originGuard(allowedOrigins: readonly string[] | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!originAllowed(c.req.raw, allowedOrigins)) {
      return c.json({ error: 'forbidden origin' }, 403);
    }
    await next();
  };
}

/** Run the dep-provided rate-limit hook for `bucket`; short-circuit on 429. */
export function rateLimitGate(
  rateLimit: ((req: Request, bucket: RateBucket) => Response | null) | undefined,
  bucket: RateBucket
): MiddlewareHandler {
  return async (c, next) => {
    const limited = rateLimit?.(c.req.raw, bucket);
    if (limited) {
      return limited;
    }
    await next();
  };
}

/**
 * Verify the request's bearer token maps to the claim named by `:paramName`.
 * On success, store the resolved claim in `c.var.owner`. On failure, 401.
 */
export function requireOwnerOf(
  claims: ClaimStore,
  paramName: string
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const token = bearerFromAuthHeader(c.req.raw);
    const target = (c.req.param(paramName) ?? '').toLowerCase();
    const owner = await claims.findByToken(token);
    // The secret is the token (already verified by the indexed hash lookup in
    // findByToken). The hub name is public — it's in the URL — so a plain
    // comparison is correct here; constant-time would protect nothing.
    if (owner === null || owner.name !== target) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('owner', owner);
    await next();
  };
}
