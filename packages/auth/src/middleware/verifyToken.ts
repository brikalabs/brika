/**
 * @brika/auth - verifyToken Middleware
 * Extract session token from cookie (or Authorization header) and validate against DB.
 */

import { inject } from '@brika/di';
import type { HonoContext, Middleware } from '@brika/router';
import { SessionService } from '../services/SessionService';
import { getAuthConfig } from '../config';

function getCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.split('=');
    if (key?.trim() === name) return rest.join('=').trim();
  }
  return undefined;
}

/**
 * Middleware to verify session tokens.
 * Reads token from HttpOnly cookie (browser) or Authorization header (API clients).
 * Looks up token in DB, attaches session to context.
 * Also updates last_seen_at (sliding expiration) and IP on each request.
 */
export function verifyToken(): Middleware {
  const sessionService = inject(SessionService);

  return async (context: HonoContext, next: () => Promise<void>) => {
    const authHeader = context.req.header('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token =
      getCookieValue(context.req.header('Cookie'), getAuthConfig().session.cookieName) ??
      bearerToken;

    if (!token) {
      context.set('session', null);
      await next();
      return;
    }

    const ip = context.req.header('x-forwarded-for') ?? context.req.header('x-real-ip');
    const session = sessionService.validateSession(token, ip ?? undefined);

    context.set('session', session);
    await next();
  };
}
