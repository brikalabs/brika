/**
 * User admin routes — list, create, get, update, delete, reset password
 */

import { inject } from '@brika/di';
import { BadRequest, Forbidden, group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { canAccess } from '../../middleware/canAccess';
import { requireAuth } from '../../middleware/requireAuth';
import {
  CreateUserSchema,
  NameSchema,
  PasswordSchema,
  RoleSchema,
  ScopeSchema,
} from '../../schemas';
import { SessionService } from '../../services/SessionService';
import { UserService } from '../../services/UserService';
import { Scope } from '../../types';
import { requireSession } from '../requireSession';

const UpdateUserSchema = z.object({
  name: NameSchema.optional(),
  role: RoleSchema.optional(),
  isActive: z.boolean().optional(),
  scopes: z.array(ScopeSchema).optional(),
});

const ResetPasswordSchema = z.object({
  password: PasswordSchema,
});

/** GET / — List all users (admin only) */
const listUsers = route.get({
  path: '/',
  handler: (ctx) => {
    requireSession(ctx, Scope.ADMIN_ALL);

    const userService = inject(UserService);
    return {
      users: userService.listUsers(),
    };
  },
});

/** POST / — Create new user (admin only) */
const createUser = route.post({
  path: '/',
  body: CreateUserSchema,
  handler: async (ctx) => {
    requireSession(ctx, Scope.ADMIN_ALL);

    const userService = inject(UserService);
    const { email, name, role, password } = ctx.body;
    const user = userService.createUser(email, name, role);

    if (password) {
      await userService.setPassword(user.id, password);
    }

    return {
      status: 201,
      body: {
        user,
      },
    };
  },
});

/** GET /:id — Get user by ID (admin or self) */
const getUser = route.get({
  path: '/:id',
  handler: (ctx) => {
    const session = requireSession(ctx);
    const { id: userId } = ctx.params as {
      id: string;
    };

    if (!canAccess(session.scopes, Scope.ADMIN_ALL) && session.userId !== userId) {
      throw new Forbidden();
    }

    const userService = inject(UserService);
    const user = userService.getUser(userId);
    if (!user) {
      throw new NotFound('User not found');
    }

    return {
      user,
    };
  },
});

/** PUT /:id/password — Reset user password (admin only) */
const resetPassword = route.put({
  path: '/:id/password',
  body: ResetPasswordSchema,
  handler: async (ctx) => {
    requireSession(ctx, Scope.ADMIN_ALL);

    const userService = inject(UserService);
    const sessionService = inject(SessionService);
    const { id: userId } = ctx.params as {
      id: string;
    };

    const user = userService.getUser(userId);
    if (!user) {
      throw new NotFound('User not found');
    }

    await userService.setPassword(userId, ctx.body.password);
    // Revoke all sessions after admin password reset to invalidate potentially compromised sessions
    sessionService.revokeAllUserSessions(userId);
    return {
      ok: true,
    };
  },
});

/** PUT /:id — Update user (admin only) */
const updateUser = route.put({
  path: '/:id',
  body: UpdateUserSchema,
  handler: (ctx) => {
    requireSession(ctx, Scope.ADMIN_ALL);

    const userService = inject(UserService);
    const { id: userId } = ctx.params as {
      id: string;
    };

    const user = userService.updateUser(userId, ctx.body);

    return {
      user,
    };
  },
});

/** DELETE /:id — Delete user (admin only) */
const deleteUser = route.delete({
  path: '/:id',
  handler: (ctx) => {
    const session = requireSession(ctx, Scope.ADMIN_ALL);

    const { id: userId } = ctx.params as {
      id: string;
    };

    if (session.userId === userId) {
      throw new BadRequest('Cannot delete your own account');
    }

    const userService = inject(UserService);
    const sessionService = inject(SessionService);
    const user = userService.getUser(userId);
    if (!user) {
      throw new NotFound('User not found');
    }

    sessionService.revokeAllUserSessions(userId);
    userService.deleteUser(user.email);
    return {
      ok: true,
    };
  },
});

export const userRoutes = group({
  prefix: '/api/users',
  middleware: [requireAuth()],
  routes: [listUsers, createUser, resetPassword, updateUser, deleteUser, getUser],
});
