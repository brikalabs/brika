/**
 * @brika/auth - requireScope Middleware
 * Enforce scope/permission requirements (throw 403 if missing)
 */

import { inject } from '@brika/di';
import type { HonoContext, Middleware } from '@brika/router';
import { Scope, Session } from '../types';
import { ScopeService } from '../services/ScopeService';

/**
 * Hono middleware to enforce scope requirements.
 * Returns 403 Forbidden if user lacks required scopes.
 */
export function requireScope(required: Scope | Scope[]): Middleware {
  const scopeService = inject(ScopeService);

  return async (context: HonoContext, next: () => Promise<void>) => {
    const session = context.get('session') as Session | null;

    if (!session) {
      return context.json(
        {
          error: 'unauthorized',
          message: 'Authentication required',
        },
        401
      );
    }

    const requiredScopes = Array.isArray(required) ? required : [required];
    const hasScope = requiredScopes.some((scope) => scopeService.hasScope(session.scopes, scope));

    if (!hasScope) {
      return context.json(
        {
          error: 'insufficient_permissions',
          message: 'This operation requires additional permissions',
        },
        403
      );
    }

    await next();
  };
}
