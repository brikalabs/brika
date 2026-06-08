/**
 * Auth routes — login, logout, session info
 */

import { inject } from '@brika/di';
import { RateLimitStore, rateLimit, route } from '@brika/router';
import { LoginSchema } from '../../schemas';
import { AuthService } from '../../services/AuthService';
import { UserService } from '../../services/UserService';
import { parseTransportHeader, type Session, TRANSPORT_HEADER } from '../../types';
import { requireSession } from '../requireSession';
import { isSecureRequest, sessionCookie } from './cookie';

/**
 * Per-username rate limit on login.
 *
 * Complements the per-IP rate limit middleware: defends against credential
 * stuffing where the attacker rotates IPs but hammers a single account.
 * 10 attempts per 15-minute window per email (case-insensitive).
 */
const USERNAME_RATE_LIMIT = new RateLimitStore(15 * 60 * 1000, 10, 60_000);

/** POST /login — Login with email and password */
const login = route.post({
  path: '/login',
  middleware: [
    rateLimit({
      window: 60,
      max: 5,
    }),
  ],
  body: LoginSchema,
  handler: async (ctx) => {
    const authService = inject(AuthService);
    const { email, password } = ctx.body;
    const ip =
      ctx.req.headers.get('x-forwarded-for') ?? ctx.req.headers.get('x-real-ip') ?? undefined;
    const userAgent = ctx.req.headers.get('user-agent') ?? undefined;
    const connectionType = parseTransportHeader(ctx.req.headers.get(TRANSPORT_HEADER));

    const usernameKey = email.toLowerCase();
    const { allowed, resetAt } = USERNAME_RATE_LIMIT.check(usernameKey);
    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return new Response(
        JSON.stringify({
          error: 'Too many attempts for this account',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    try {
      const result = await authService.login(email, password, ip, userAgent, connectionType);

      return new Response(
        JSON.stringify({
          user: result.user,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': sessionCookie(result.token, result.expiresIn, isSecureRequest(ctx.req)),
          },
        }
      );
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Invalid credentials',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  },
});

/** POST /logout — Logout and revoke current session */
const logout = route.post({
  path: '/logout',
  handler: (ctx) => {
    const authService = inject(AuthService);
    const session = ctx.get('session') as Session | null;

    if (session) {
      authService.logout(session.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie('', 0, isSecureRequest(ctx.req)),
        },
      }
    );
  },
});

/** GET /session — Get current session info */
const sessionInfo = route.get({
  path: '/session',
  handler: (ctx) => {
    const session = requireSession(ctx);
    const userService = inject(UserService);
    const user = userService.getUser(session.userId);

    return {
      user,
      scopes: session.scopes,
    };
  },
});

export const authPublicRoutes = [login];
export const authProtectedRoutes = [logout, sessionInfo];
