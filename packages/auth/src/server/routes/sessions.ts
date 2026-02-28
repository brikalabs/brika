/**
 * Session management routes — list, revoke
 */

import { route, Forbidden } from '@brika/router';
import { inject } from '@brika/di';
import { Scope } from '../../types';
import { SessionService } from '../../services/SessionService';
import { canAccess } from '../../middleware/canAccess';
import { requireSession } from '../requireSession';

/** GET /sessions — List active sessions for current user */
const listSessions = route.get({ path: '/sessions', handler: async (ctx) => {
  const session = requireSession(ctx);
  const sessionService = inject(SessionService);
  const sessions = sessionService.listUserSessions(session.userId);

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === session.id,
    })),
  };
}});

/** DELETE /sessions/:id — Revoke a specific session */
const revokeSession = route.delete({ path: '/sessions/:id', handler: async (ctx) => {
  const session = requireSession(ctx);
  const { id: sessionId } = ctx.params as { id: string };
  const sessionService = inject(SessionService);

  const isOwn = sessionService.listUserSessions(session.userId).some((s) => s.id === sessionId);
  if (!isOwn && !canAccess(session.scopes, Scope.ADMIN_ALL)) throw new Forbidden();

  sessionService.revokeSession(sessionId);
  return { ok: true };
}});

/** DELETE /sessions — Revoke all sessions for current user (signs out everywhere) */
const revokeAllSessions = route.delete({ path: '/sessions', handler: async (ctx) => {
  const session = requireSession(ctx);
  const sessionService = inject(SessionService);
  sessionService.revokeAllUserSessions(session.userId);
  return { ok: true };
}});

export const sessionRoutes = [listSessions, revokeSession, revokeAllSessions];
