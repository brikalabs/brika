/**
 * @brika/auth/server - requireSession
 *
 * Extract authenticated session from route context.
 * Throws 401 Unauthorized if no session.
 * Optionally validates scope — throws 403 Forbidden if missing required scope.
 *
 * @example
 * ```ts
 * // Just auth check
 * const session = requireSession(ctx);
 *
 * // Auth + scope check (throws 403 if missing)
 * const session = requireSession(ctx, Scope.ADMIN_ALL);
 *
 * // Auth + any-of scope check
 * const session = requireSession(ctx, [Scope.WORKFLOW_READ, Scope.ADMIN_ALL]);
 * ```
 */

import { Forbidden, Unauthorized } from '@brika/router';
import { canAccess } from '../middleware/canAccess';
import type { Scope, Session } from '../types';

export function requireSession(
  ctx: {
    get(key: string): unknown;
  },
  scope?: Scope | Scope[]
): Session {
  const session = ctx.get('session') as Session | null;
  if (!session) {
    throw new Unauthorized();
  }

  if (scope !== undefined) {
    if (!canAccess(session.scopes, scope)) {
      const required = Array.isArray(scope) ? scope : [scope];
      throw new Forbidden(`Insufficient permissions. Required: ${required.join(', ')}`);
    }
  }

  return session;
}
