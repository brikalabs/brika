import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { PluginPermissionService } from '@/runtime/plugins/plugin-permissions';
import { StateStore } from '@/runtime/state/state-store';

describe('PluginPermissionService', () => {
  let service: PluginPermissionService;
  let mockGetGranted: ReturnType<typeof mock>;
  let mockSetGranted: ReturnType<typeof mock>;

  useTestBed({ autoStub: false });

  beforeEach(() => {
    mockGetGranted = mock().mockReturnValue([]);
    mockSetGranted = mock().mockResolvedValue(undefined);
    stub(StateStore, {
      getGrantedPermissions: mockGetGranted,
      setGrantedPermissions: mockSetGranted,
    });
    stub(Logger);
    service = get(PluginPermissionService);
  });

  // ─── hasPermission ──────────────────────────────────────────────────────────

  describe('hasPermission', () => {
    test('returns true when permission is granted', () => {
      mockGetGranted.mockReturnValue(['location']);

      const result = service.hasPermission('@brika/plugin-weather', 'location');

      expect(result).toBeTrue();
    });

    test('returns false when permission is not granted', () => {
      mockGetGranted.mockReturnValue([]);

      const result = service.hasPermission('@brika/plugin-weather', 'location');

      expect(result).toBeFalse();
    });

    test('returns false for unrelated permissions', () => {
      mockGetGranted.mockReturnValue(['other']);

      const result = service.hasPermission('@brika/plugin-weather', 'location');

      expect(result).toBeFalse();
    });
  });

  // ─── getGrantedPermissions ──────────────────────────────────────────────────

  describe('getGrantedPermissions', () => {
    test('returns only valid permissions', () => {
      mockGetGranted.mockReturnValue(['location', 'unknown-perm', 'also-invalid']);

      const result = service.getGrantedPermissions('@brika/plugin-weather');

      expect(result).toEqual(['location']);
    });

    test('returns empty array when no permissions', () => {
      mockGetGranted.mockReturnValue([]);

      const result = service.getGrantedPermissions('@brika/plugin-weather');

      expect(result).toEqual([]);
    });

    test('filters out all invalid permissions', () => {
      mockGetGranted.mockReturnValue(['bad', 'also-bad']);

      const result = service.getGrantedPermissions('@brika/plugin-weather');

      expect(result).toEqual([]);
    });
  });

  // ─── setPermission ─────────────────────────────────────────────────────────

  describe('setPermission', () => {
    test('grants a valid permission', async () => {
      mockGetGranted.mockReturnValue([]);

      const result = await service.setPermission('@brika/plugin-weather', 'location', true);

      expect(mockSetGranted).toHaveBeenCalledWith('@brika/plugin-weather', ['location']);
      expect(result).toEqual(['location']);
    });

    test('revokes a valid permission', async () => {
      mockGetGranted.mockReturnValue(['location']);

      const result = await service.setPermission('@brika/plugin-weather', 'location', false);

      expect(mockSetGranted).toHaveBeenCalledWith('@brika/plugin-weather', []);
      expect(result).toEqual([]);
    });

    test('throws for unknown permission', async () => {
      await expect(
        service.setPermission('@brika/plugin-weather', 'unknown-perm', true)
      ).rejects.toThrow('Unknown permission: "unknown-perm"');
    });

    test('does not duplicate already-granted permission', async () => {
      mockGetGranted.mockReturnValue(['location']);

      const result = await service.setPermission('@brika/plugin-weather', 'location', true);

      expect(mockSetGranted).toHaveBeenCalledWith('@brika/plugin-weather', ['location']);
      expect(result).toEqual(['location']);
    });

    test('revoking non-granted permission is a no-op', async () => {
      mockGetGranted.mockReturnValue([]);

      const result = await service.setPermission('@brika/plugin-weather', 'location', false);

      expect(mockSetGranted).toHaveBeenCalledWith('@brika/plugin-weather', []);
      expect(result).toEqual([]);
    });
  });
});
