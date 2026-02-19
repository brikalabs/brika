/**
 * Tests for PluginPermissionService
 *
 * Validates permission grant/revoke logic, validation, persistence, and scoping.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ─── Minimal stub for StateStore (avoid DI / reflect-metadata) ──────────────
interface StubState {
  permissions: Record<string, string[]>;
}

function createStubStateStore() {
  const state: StubState = { permissions: {} };

  return {
    getGrantedPermissions(name: string): string[] {
      return state.permissions[name] ?? [];
    },
    async setGrantedPermissions(name: string, permissions: string[]) {
      state.permissions[name] = permissions;
    },
    _state: state,
  };
}

// ─── Re-implement service logic without DI for unit testing ─────────────────
// We test the same logic as PluginPermissionService but without @singleton()/@inject()
import { filterValidPermissions, isValidPermission, type Permission } from '@brika/shared';

function createPermissionService(stateStore: ReturnType<typeof createStubStateStore>) {
  return {
    hasPermission(pluginName: string, permission: Permission): boolean {
      const granted = stateStore.getGrantedPermissions(pluginName);
      return granted.includes(permission);
    },

    getGrantedPermissions(pluginName: string): Permission[] {
      const raw = stateStore.getGrantedPermissions(pluginName);
      return filterValidPermissions(raw);
    },

    async setPermission(
      pluginName: string,
      permission: string,
      granted: boolean
    ): Promise<Permission[]> {
      if (!isValidPermission(permission)) {
        throw new Error(`Unknown permission: "${permission}"`);
      }

      const current = new Set(stateStore.getGrantedPermissions(pluginName));

      if (granted) {
        current.add(permission);
      } else {
        current.delete(permission);
      }

      const updated = filterValidPermissions([...current]);
      await stateStore.setGrantedPermissions(pluginName, updated);
      return updated;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PluginPermissionService', () => {
  let store: ReturnType<typeof createStubStateStore>;
  let service: ReturnType<typeof createPermissionService>;

  beforeEach(() => {
    store = createStubStateStore();
    service = createPermissionService(store);
  });

  // ─── hasPermission ──────────────────────────────────────────────────────

  describe('hasPermission', () => {
    test('returns true when permission is granted', async () => {
      await service.setPermission('weather', 'location', true);
      expect(service.hasPermission('weather', 'location')).toBe(true);
    });

    test('returns false when permission is not granted', () => {
      expect(service.hasPermission('weather', 'location')).toBe(false);
    });

    test('scopes grants per plugin', async () => {
      await service.setPermission('weather', 'location', true);
      expect(service.hasPermission('weather', 'location')).toBe(true);
      expect(service.hasPermission('timer', 'location')).toBe(false);
    });

    test('returns false after permission is revoked', async () => {
      await service.setPermission('weather', 'location', true);
      await service.setPermission('weather', 'location', false);
      expect(service.hasPermission('weather', 'location')).toBe(false);
    });
  });

  // ─── getGrantedPermissions ──────────────────────────────────────────────

  describe('getGrantedPermissions', () => {
    test('returns empty array for unknown plugin', () => {
      expect(service.getGrantedPermissions('nonexistent')).toEqual([]);
    });

    test('returns granted permissions', async () => {
      await service.setPermission('weather', 'location', true);
      expect(service.getGrantedPermissions('weather')).toEqual(['location']);
    });

    test('filters out invalid permissions from state', () => {
      // Simulate state with stale/invalid permission values
      store._state.permissions['bad-plugin'] = ['location', 'invalid', '__proto__'];
      expect(service.getGrantedPermissions('bad-plugin')).toEqual(['location']);
    });

    test('returns empty array when all permissions are invalid', () => {
      store._state.permissions['bad-plugin'] = ['foo', 'bar'];
      expect(service.getGrantedPermissions('bad-plugin')).toEqual([]);
    });
  });

  // ─── setPermission ────────────────────────────────────────────────────

  describe('setPermission', () => {
    test('grants a valid permission', async () => {
      const result = await service.setPermission('weather', 'location', true);
      expect(result).toEqual(['location']);
      expect(store._state.permissions['weather']).toEqual(['location']);
    });

    test('revokes a granted permission', async () => {
      await service.setPermission('weather', 'location', true);
      const result = await service.setPermission('weather', 'location', false);
      expect(result).toEqual([]);
      expect(store._state.permissions['weather']).toEqual([]);
    });

    test('throws for unknown permission', async () => {
      await expect(service.setPermission('weather', 'network', true)).rejects.toThrow(
        'Unknown permission: "network"'
      );
    });

    test('throws for prototype pollution attempts', async () => {
      await expect(service.setPermission('weather', '__proto__', true)).rejects.toThrow(
        'Unknown permission'
      );
    });

    test('throws for constructor injection', async () => {
      await expect(service.setPermission('weather', 'constructor', true)).rejects.toThrow(
        'Unknown permission'
      );
    });

    test('granting same permission twice is idempotent', async () => {
      await service.setPermission('weather', 'location', true);
      const result = await service.setPermission('weather', 'location', true);
      expect(result).toEqual(['location']);
    });

    test('revoking non-granted permission is a no-op', async () => {
      const result = await service.setPermission('weather', 'location', false);
      expect(result).toEqual([]);
    });

    test('persists to state store', async () => {
      await service.setPermission('weather', 'location', true);
      // Verify raw state was updated
      expect(store._state.permissions['weather']).toContain('location');
    });

    test('filters invalid entries during set', () => {
      // Pre-populate with invalid data, then grant valid permission
      store._state.permissions['weather'] = ['garbage'];
      return service.setPermission('weather', 'location', true).then((result) => {
        // 'garbage' should be filtered out, only 'location' remains
        expect(result).toEqual(['location']);
      });
    });
  });

  // ─── Cross-plugin isolation ─────────────────────────────────────────────

  describe('cross-plugin isolation', () => {
    test('granting for one plugin does not affect another', async () => {
      await service.setPermission('weather', 'location', true);
      await service.setPermission('timer', 'location', false);

      expect(service.hasPermission('weather', 'location')).toBe(true);
      expect(service.hasPermission('timer', 'location')).toBe(false);
    });

    test('revoking for one plugin does not affect another', async () => {
      await service.setPermission('weather', 'location', true);
      await service.setPermission('timer', 'location', true);
      await service.setPermission('weather', 'location', false);

      expect(service.hasPermission('weather', 'location')).toBe(false);
      expect(service.hasPermission('timer', 'location')).toBe(true);
    });
  });
});
