/**
 * @brika/auth - ScopeService
 * Handles scope validation and permission checks
 */

import { injectable } from '@brika/di';
import { ROLE_SCOPES, SCOPES_REGISTRY } from '../constants';
import { Role, Scope } from '../types';

/**
 * Service for managing scopes and permissions
 */
@injectable()
export class ScopeService {
  /**
   * Check if scope is valid
   */
  isValidScope(scope: string): scope is Scope {
    return Object.values(Scope).includes(scope as Scope);
  }

  /**
   * Validate array of scopes
   */
  validateScopes(scopes: unknown[]): Scope[] {
    if (!Array.isArray(scopes)) {
      return [];
    }

    return scopes.filter((s) => this.isValidScope(s as string)) as Scope[];
  }

  /**
   * Get scopes for a user based on role
   */
  getScopesForRole(role: Role): Scope[] {
    return ROLE_SCOPES[role] || [];
  }

  /**
   * Check if scopes include required scope
   */
  hasScope(scopes: Scope[], requiredScope: Scope): boolean {
    if (requiredScope === Scope.ADMIN_ALL) {
      return scopes.includes(Scope.ADMIN_ALL);
    }

    return scopes.includes(requiredScope) || scopes.includes(Scope.ADMIN_ALL);
  }

  /**
   * Check if scopes include any in list
   */
  hasScopeAny(scopes: Scope[], required: Scope[]): boolean {
    return required.some((scope) => this.hasScope(scopes, scope));
  }

  /**
   * Check if scopes include all in list
   */
  hasScopeAll(scopes: Scope[], required: Scope[]): boolean {
    return required.every((scope) => this.hasScope(scopes, scope));
  }

  /**
   * Get all available scopes
   */
  getAllScopes(): Scope[] {
    return Object.values(Scope) as Scope[];
  }

  /**
   * Get scopes by category
   */
  getScopesByCategory(category: string): Scope[] {
    return Object.entries(SCOPES_REGISTRY)
      .filter(([, info]) => info.category === category)
      .map(([scope]) => scope as Scope);
  }

  /**
   * Get scope description
   */
  getScopeDescription(scope: Scope): string {
    return SCOPES_REGISTRY[scope]?.description || 'Unknown scope';
  }

  /**
   * Get all scopes with descriptions
   */
  getRegistry() {
    return SCOPES_REGISTRY;
  }
}
