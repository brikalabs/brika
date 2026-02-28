/**
 * @brika/auth/react - withScopeGuard HOC
 *
 * Higher-order component to protect components with scope requirements.
 */

import React from 'react';
import { Scope } from '../types';
import { useCanAccess } from './hooks';

export interface WithScopeGuardOptions {
  fallback?: React.ReactNode;
}

const DEFAULT_FALLBACK = (
  <div>
    <h1>Unauthorized</h1>
    <p>You don't have permission to access this page.</p>
  </div>
);

/**
 * HOC to protect a component with scope requirement.
 *
 * @example
 * ```tsx
 * const ProtectedEditor = withScopeGuard(
 *   WorkflowEditor,
 *   Scope.WORKFLOW_WRITE,
 *   { fallback: <UnauthorizedPage /> }
 * );
 * ```
 */
export function withScopeGuard<P extends object>(
  Component: React.ComponentType<P>,
  requiredScopes: Scope | Scope[] | null,
  options?: WithScopeGuardOptions
): React.ComponentType<P> {
  const displayName = `withScopeGuard(${Component.displayName || Component.name})`;

  const Wrapper = (props: P) => {
    const canAccess = useCanAccess(requiredScopes);

    if (!canAccess) {
      return options?.fallback !== undefined ? options.fallback : DEFAULT_FALLBACK;
    }

    return <Component {...props} />;
  };

  Wrapper.displayName = displayName;

  return Wrapper;
}

/**
 * HOC to hide component if user lacks scope
 * (renders nothing instead of fallback)
 *
 * @example
 * ```tsx
 * const OptionalButton = withOptionalScope(AdminButton, Scope.ADMIN_ALL);
 * // Returns null if user doesn't have admin scope
 * ```
 */
export function withOptionalScope<P extends object>(
  Component: React.ComponentType<P>,
  requiredScopes: Scope | Scope[] | null
): React.ComponentType<P> {
  return withScopeGuard(Component, requiredScopes, { fallback: null });
}
