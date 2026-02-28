/**
 * @brika/auth - requireAuth Middleware
 * Enforce authentication (block unauthenticated requests)
 */

import type { HonoContext, Middleware } from '@brika/router';
import { Session } from '../types';

/**
 * Hono middleware to enforce authentication.
 * Returns 401 if no valid session.
 */
export function requireAuth(): Middleware {
  return async (context: HonoContext, next: () => Promise<void>) => {
    const session = context.get('session');

    if (!session) {
      return context.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}

/**
 * Type for authenticated context
 */
export interface AuthContext {
  session: Session;
}
