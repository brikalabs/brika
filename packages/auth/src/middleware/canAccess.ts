/**
 * @brika/auth - canAccess Helper
 * Check scope/permission without throwing (returns boolean)
 */

import { Scope } from '../types';

/**
 * Check if session/scopes can access a feature
 * Returns boolean (safe for use in UI logic, conditionals, etc)
 *
 * @example
 * ```ts
 * const canEditWorkflow = canAccess(session.scopes, Scope.WORKFLOW_WRITE);
 * if (canEditWorkflow) {
 *   renderEditButton();
 * }
 *
 * // In routes
 * if (!canAccess(session.scopes, [Scope.ADMIN_ALL])) {
 *   return forbidden();
 * }
 * ```
 */
export function canAccess(scopes: Scope[] | null | undefined, required: Scope | Scope[]): boolean {
  if (!scopes || scopes.length === 0) {
    return false;
  }

  const requiredScopes = Array.isArray(required)
    ? required
    : [
        required,
      ];

  // Admin can access everything
  if (scopes.includes(Scope.ADMIN_ALL)) {
    return true;
  }

  // Check if has any required scope
  return requiredScopes.some((scope) => scopes.includes(scope));
}

/**
 * Check if session can access all required scopes
 *
 * @example
 * ```ts
 * const canManageUsers = canAccessAll(session.scopes, [
 *   Scope.ADMIN_ALL,
 * ]);
 * ```
 */
export function canAccessAll(scopes: Scope[] | null | undefined, required: Scope[]): boolean {
  if (!scopes || scopes.length === 0) {
    return false;
  }

  // Admin can access everything
  if (scopes.includes(Scope.ADMIN_ALL)) {
    return true;
  }

  // Check if has all required scopes
  return required.every((scope) => scopes.includes(scope));
}

/**
 * Create a permission checker for a specific feature
 * Useful for organizing feature flags
 *
 * @example
 * ```ts
 * const WorkflowPermissions = {
 *   read: (scopes) => canAccess(scopes, Scope.WORKFLOW_READ),
 *   write: (scopes) => canAccess(scopes, Scope.WORKFLOW_WRITE),
 *   execute: (scopes) => canAccess(scopes, Scope.WORKFLOW_EXECUTE),
 * };
 *
 * // Usage
 * if (WorkflowPermissions.execute(session.scopes)) {
 *   canRunWorkflow = true;
 * }
 * ```
 */
export function createPermissionChecker(
  featureName: string,
  scopeMap: Record<string, Scope | Scope[]>
): Record<string, (scopes: Scope[] | null | undefined) => boolean> {
  return Object.entries(scopeMap).reduce(
    (acc, [action, scopes]) => {
      acc[action] = (userScopes: Scope[] | null | undefined) => canAccess(userScopes, scopes);
      return acc;
    },
    {} as Record<string, (scopes: Scope[] | null | undefined) => boolean>
  );
}

/**
 * Feature permission objects (pre-built for common features)
 */
export const Features = {
  Workflow: createPermissionChecker('Workflow', {
    read: Scope.WORKFLOW_READ,
    write: Scope.WORKFLOW_WRITE,
    execute: Scope.WORKFLOW_EXECUTE,
    all: [
      Scope.WORKFLOW_READ,
      Scope.WORKFLOW_WRITE,
      Scope.WORKFLOW_EXECUTE,
    ],
  }),

  Board: createPermissionChecker('Board', {
    read: Scope.BOARD_READ,
    write: Scope.BOARD_WRITE,
    all: [
      Scope.BOARD_READ,
      Scope.BOARD_WRITE,
    ],
  }),

  Plugin: createPermissionChecker('Plugin', {
    read: Scope.PLUGIN_READ,
    manage: Scope.PLUGIN_MANAGE,
  }),

  Settings: createPermissionChecker('Settings', {
    read: Scope.SETTINGS_READ,
    write: Scope.SETTINGS_WRITE,
  }),

  Admin: createPermissionChecker('Admin', {
    all: Scope.ADMIN_ALL,
  }),
};
