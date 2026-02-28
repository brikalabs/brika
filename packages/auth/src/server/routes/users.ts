/**
 * User admin routes — list, create, get, update, delete, reset password
 */

import { route, group, BadRequest, Forbidden, NotFound } from '@brika/router';
import { inject } from '@brika/di';
import { z } from 'zod';
import { Scope } from '../../types';
import { CreateUserSchema, PasswordSchema, RoleSchema, ScopeSchema, NameSchema } from '../../schemas';
import { UserService } from '../../services/UserService';
import { SessionService } from '../../services/SessionService';
import { canAccess } from '../../middleware/canAccess';
import { requireSession } from '../requireSession';
import { requireAuth } from '../../middleware/requireAuth';

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
const listUsers = route.get({ path: '/', handler: async (ctx) => {
  requireSession(ctx, Scope.ADMIN_ALL);

  const userService = inject(UserService);
  return { users: await userService.listUsers() };
}});

/** POST / — Create new user (admin only) */
const createUser = route.post({ path: '/', body: CreateUserSchema, handler: async (ctx) => {
  requireSession(ctx, Scope.ADMIN_ALL);

  const userService = inject(UserService);
  const { email, name, role, password } = ctx.body;
  const user = await userService.createUser(email, name, role);

  if (password) {
    await userService.setPassword(user.id, password);
  }

  return { status: 201, body: { user } };
}});

/** GET /:id — Get user by ID (admin or self) */
const getUser = route.get({ path: '/:id', handler: async (ctx) => {
  const session = requireSession(ctx);
  const { id: userId } = ctx.params as { id: string };

  if (!canAccess(session.scopes, Scope.ADMIN_ALL) && session.userId !== userId) {
    throw new Forbidden();
  }

  const userService = inject(UserService);
  const user = await userService.getUser(userId);
  if (!user) throw new NotFound('User not found');

  return { user };
}});

/** PUT /:id/password — Reset user password (admin only) */
const resetPassword = route.put({ path: '/:id/password', body: ResetPasswordSchema, handler: async (ctx) => {
  requireSession(ctx, Scope.ADMIN_ALL);

  const userService = inject(UserService);
  const sessionService = inject(SessionService);
  const { id: userId } = ctx.params as { id: string };

  const user = await userService.getUser(userId);
  if (!user) throw new NotFound('User not found');

  await userService.setPassword(userId, ctx.body.password);
  // Revoke all sessions after admin password reset to invalidate potentially compromised sessions
  sessionService.revokeAllUserSessions(userId);
  return { ok: true };
}});

/** PUT /:id — Update user (admin only) */
const updateUser = route.put({ path: '/:id', body: UpdateUserSchema, handler: async (ctx) => {
  requireSession(ctx, Scope.ADMIN_ALL);

  const userService = inject(UserService);
  const { id: userId } = ctx.params as { id: string };

  const user = await userService.updateUser(userId, ctx.body);

  return { user };
}});

/** DELETE /:id — Delete user (admin only) */
const deleteUser = route.delete({ path: '/:id', handler: async (ctx) => {
  const session = requireSession(ctx, Scope.ADMIN_ALL);

  const { id: userId } = ctx.params as { id: string };

  if (session.userId === userId) {
    throw new BadRequest('Cannot delete your own account');
  }

  const userService = inject(UserService);
  const sessionService = inject(SessionService);
  const user = await userService.getUser(userId);
  if (!user) throw new NotFound('User not found');

  sessionService.revokeAllUserSessions(userId);
  await userService.deleteUser(user.email);
  return { ok: true };
}});

export const userRoutes = group({
  prefix: '/api/users',
  middleware: [requireAuth()],
  routes: [
    listUsers,
    createUser,
    resetPassword,
    updateUser,
    deleteUser,
    getUser,
  ],
});
