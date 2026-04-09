/**
 * Setup routes — First-run admin creation
 *
 * These routes are public (no auth required) but locked once an admin exists.
 * Setup status is served by the hub-level route at /api/setup/status which
 * combines hasAdmin() with the hub's setupCompleted flag.
 */

import { inject } from '@brika/di';
import { Conflict, rateLimit, route } from '@brika/router';
import { Role } from '../../roles';
import { SetupSchema } from '../../schemas';
import { AuthService } from '../../services/AuthService';
import { UserService } from '../../services/UserService';
import { sessionCookie } from './cookie';

/** POST / — Create the first admin account */
const createAdmin = route.post({
  path: '/',
  middleware: [rateLimit({ window: 60, max: 3 })],
  body: SetupSchema,
  handler: async (ctx) => {
    const userService = inject(UserService);
    const authService = inject(AuthService);

    if (userService.hasAdmin()) {
      throw new Conflict('Setup already completed');
    }

    const { email, name, password } = ctx.body;
    const user = userService.createUser(email, name, Role.ADMIN);
    await userService.setPassword(user.id, password);

    // Auto-login: create session and set cookie
    const ip =
      ctx.req.headers.get('x-forwarded-for') ?? ctx.req.headers.get('x-real-ip') ?? undefined;
    const userAgent = ctx.req.headers.get('user-agent') ?? undefined;
    const result = await authService.login(email, password, ip, userAgent);

    return new Response(JSON.stringify({ user: result.user }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(result.token, result.expiresIn),
      },
    });
  },
});

export const setupRoutes = [createAdmin];
