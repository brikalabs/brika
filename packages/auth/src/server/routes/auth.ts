/**
 * Auth routes — login, logout, session info
 */

import { inject } from '@brika/di';
import { rateLimit, route } from '@brika/router';
import { getAuthConfig } from '../../config';
import { LoginSchema } from '../../schemas';
import { AuthService } from '../../services/AuthService';
import { UserService } from '../../services/UserService';
import type { Session } from '../../types';
import { requireSession } from '../requireSession';

function sessionCookie(token: string, maxAge: number): string {
  const name = getAuthConfig().session.cookieName;
  return `${name}=${token}; HttpOnly; Secure; Path=/api; Max-Age=${maxAge}; SameSite=Lax`;
}

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

    try {
      const result = await authService.login(email, password, ip, userAgent);

      return new Response(
        JSON.stringify({
          user: result.user,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': sessionCookie(result.token, result.expiresIn),
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
          'Set-Cookie': sessionCookie('', 0),
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
