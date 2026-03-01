/**
 * @brika/auth/react - Hooks
 *
 * React hooks for authentication
 */

import { useContext, useMemo } from 'react';
import { canAccess, canAccessAll, Features } from '../middleware/canAccess';
import { Scope } from '../types';
import { AuthContext, AuthContextValue } from './AuthProvider';

/**
 * Use authentication context
 *
 * @example
 * ```tsx
 * const { user, login, logout } = useAuth();
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }

  return context;
}

/**
 * Check if user has access to a scope
 *
 * @example
 * ```tsx
 * const canEdit = useCanAccess(Scope.WORKFLOW_WRITE);
 * ```
 */
export function useCanAccess(required: Scope | Scope[] | null): boolean {
  const { session } = useAuth();

  return useMemo(() => {
    if (!required || !session) {
      return false;
    }
    return canAccess((session.scopes || []) as Scope[], required);
  }, [
    required,
    session?.scopes,
  ]);
}

/**
 * Check if user has all required scopes
 *
 * @example
 * ```tsx
 * const canManage = useCanAccessAll([Scope.ADMIN_ALL]);
 * ```
 */
export function useCanAccessAll(required: Scope[] | null): boolean {
  const { session } = useAuth();

  return useMemo(() => {
    if (!required || !session) {
      return false;
    }
    return canAccessAll((session.scopes || []) as Scope[], required);
  }, [
    required,
    session?.scopes,
  ]);
}

/**
 * Get feature permissions
 *
 * @example
 * ```tsx
 * const perms = useFeaturePermissions(Features.Workflow);
 * if (perms.execute) {
 *   // show execute button
 * }
 * ```
 */
export function useFeaturePermissions<
  T extends Record<string, boolean | ((scopes: Scope[]) => boolean)>,
>(featurePermissions: T): Record<keyof T, boolean> {
  const { session } = useAuth();

  return useMemo(() => {
    const scopes = (session?.scopes ?? []) as Scope[];
    return Object.fromEntries(
      Object.entries(featurePermissions).map(([key, checker]) => {
        if (!session) {
          return [
            key,
            false,
          ];
        }
        const value = typeof checker === 'function' ? checker(scopes) : checker;
        return [
          key,
          value,
        ];
      })
    ) as Record<keyof T, boolean>;
  }, [
    session?.scopes,
  ]);
}

/**
 * Check if user is loading auth state
 */
export function useAuthLoading(): boolean {
  const { isLoading } = useAuth();
  return isLoading;
}

/**
 * Get current user
 */
export function useUser() {
  const { user } = useAuth();
  return user;
}

/**
 * Get current session
 */
export function useSession() {
  const { session } = useAuth();
  return session;
}

/**
 * Get auth error
 */
export function useAuthError() {
  const { error } = useAuth();
  return error;
}
