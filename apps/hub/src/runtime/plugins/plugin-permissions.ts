/**
 * Plugin Permission Service
 *
 * Hub-side service for managing plugin permission grants.
 * Handles validation, persistence, and runtime permission checks.
 *
 * ## Security guarantees
 * - Only permissions from the typed `Permission` registry are accepted
 * - Unknown permission strings are silently rejected (never stored or granted)
 * - Grants are scoped per-plugin — a grant for plugin A does not affect plugin B
 * - Permission checks are synchronous (no async gaps that could be exploited)
 * - All state mutations go through `StateStore` (single source of truth)
 */

import { inject, singleton } from '@brika/di';
import { filterValidPermissions, isValidPermission, type Permission } from '@brika/permissions';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';

@singleton()
export class PluginPermissionService {
  readonly #state = inject(StateStore);
  readonly #logs = inject(Logger).withSource('plugin');

  /**
   * Check if a specific permission is granted for a plugin.
   *
   * @param pluginName - The plugin package name (e.g., "@brika/plugin-weather")
   * @param permission - The permission to check (e.g., "location")
   * @returns `true` if the permission is both valid and granted
   */
  hasPermission(pluginName: string, permission: Permission): boolean {
    const granted = this.#state.getGrantedPermissions(pluginName);
    return granted.includes(permission);
  }

  /**
   * Get all granted permissions for a plugin, filtered to valid ones only.
   *
   * @param pluginName - The plugin package name
   * @returns Array of granted permission IDs (only valid, typed permissions)
   */
  getGrantedPermissions(pluginName: string): Permission[] {
    const raw = this.#state.getGrantedPermissions(pluginName);
    return filterValidPermissions(raw);
  }

  /**
   * Grant or revoke a single permission for a plugin.
   *
   * @param pluginName - The plugin package name
   * @param permission - The permission to toggle
   * @param granted - Whether to grant (`true`) or revoke (`false`)
   * @returns The updated list of granted permissions
   * @throws If the permission is not a valid, recognized permission ID
   */
  async setPermission(
    pluginName: string,
    permission: string,
    granted: boolean
  ): Promise<Permission[]> {
    if (!isValidPermission(permission)) {
      this.#logs.warn('Rejected unknown permission', {
        pluginName,
        permission,
      });
      throw new Error(`Unknown permission: "${permission}"`);
    }

    const current = new Set(this.#state.getGrantedPermissions(pluginName));

    if (granted) {
      current.add(permission);
    } else {
      current.delete(permission);
    }

    const updated = filterValidPermissions([
      ...current,
    ]);
    await this.#state.setGrantedPermissions(pluginName, updated);

    this.#logs.info(`Permission ${granted ? 'granted' : 'revoked'}`, {
      pluginName,
      permission,
    });

    return updated;
  }
}
