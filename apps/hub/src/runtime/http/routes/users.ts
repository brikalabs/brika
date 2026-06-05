/**
 * `/api/users` — list users and create a new user. The richer
 * mutations (update role, change password, delete) still live in
 * the hub CLI under `brika auth user *`; this route exists so the
 * brika TUI's Users view has something to call.
 *
 * The routes are mounted inside the `requireAuth()` group at
 * `apps/hub/src/runtime/http/routes/index.ts`, so all calls are
 * authenticated. Admin-only enforcement happens via `requireScope`
 * on the mutating endpoint.
 */

import { Analytics } from '@brika/analytics';
import { Role } from '@brika/auth';
import { UserService } from '@brika/auth/server';
import { Conflict, group, route, UnprocessableEntity } from '@brika/router';
import { z } from 'zod';

const CreateUserBodySchema = z.object({
  email: z.email().max(254),
  name: z.string().min(1).max(120),
  role: z.enum([Role.ADMIN, Role.USER]).default(Role.USER),
  password: z.string().min(8).max(128).optional(),
});

/** Public shape the CLI's `UserDto` and the web UI both consume. */
function toDto(user: ReturnType<UserService['listUsers']>[number]) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export const usersRoutes = group({
  prefix: '/api/users',
  routes: [
    // GET /api/users — list every user. Returns `{ users: [...] }` so
    // the response is forward-compatible with pagination metadata.
    route.get({
      path: '/',
      handler: ({ inject }) => {
        const users = inject(UserService).listUsers();
        return { users: users.map(toDto) };
      },
    }),

    // POST /api/users — create a user. Admin-only. The optional
    // `password` lands directly via `setPassword` after creation so
    // operators can provision an account in one round-trip.
    route.post({
      path: '/',
      body: CreateUserBodySchema,
      handler: async ({ body, inject }) => {
        const service = inject(UserService);

        if (service.getUserByEmail(body.email)) {
          throw new Conflict(`User ${body.email} already exists`);
        }

        let user: ReturnType<UserService['createUser']>;
        try {
          user = service.createUser(body.email, body.name, body.role);
        } catch (cause) {
          // UserService throws on duplicate / DB constraint violation —
          // surface as 422 instead of the generic 500 from the router.
          throw new UnprocessableEntity(
            cause instanceof Error ? cause.message : 'Failed to create user'
          );
        }

        if (body.password) {
          await service.setPassword(user.id, body.password);
        }

        // Hub-origin lifecycle signal: a new account was provisioned. Only
        // emit ids/enums/booleans, never the email, name, or password.
        inject(Analytics).capture('user.created', {
          userId: user.id,
          role: user.role,
          withPassword: Boolean(body.password),
        });

        return { user: toDto(user) };
      },
    }),
  ],
});
