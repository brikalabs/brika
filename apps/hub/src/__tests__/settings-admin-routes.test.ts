/**
 * Admin-scope settings routes — the update-channel + pinned-version
 * PUTs. Both routes invalidate the `UpdateService` cache after
 * mutating state; we mock the service to verify that contract
 * without standing up the real fetcher chain.
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { settingsAdminRoutes } from '@/runtime/http/routes/settings';
import { StateStore } from '@/runtime/state/state-store';
import { UpdateService } from '@/runtime/updates';

describe('settings admin routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockState: {
    getPinnedVersion: ReturnType<typeof mock>;
    setUpdateChannel: ReturnType<typeof mock>;
    setPinnedVersion: ReturnType<typeof mock>;
  };
  let mockUpdateService: {
    invalidate: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockState = {
      getPinnedVersion: mock().mockReturnValue(null),
      setUpdateChannel: mock(),
      setPinnedVersion: mock(),
    };
    mockUpdateService = {
      invalidate: mock(),
    };
    stub(StateStore, mockState);
    stub(UpdateService, mockUpdateService);
    app = TestApp.create(settingsAdminRoutes);
  });

  describe('PUT /api/settings/update-channel', () => {
    test('switches to stable and invalidates the update cache', async () => {
      const res = await app.put('/api/settings/update-channel', { channel: 'stable' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ channel: 'stable' });
      expect(mockState.setUpdateChannel).toHaveBeenCalledWith('stable');
      expect(mockUpdateService.invalidate).toHaveBeenCalledTimes(1);
    });

    test('switches to canary', async () => {
      const res = await app.put('/api/settings/update-channel', { channel: 'canary' });
      expect(res.status).toBe(200);
      expect(mockState.setUpdateChannel).toHaveBeenCalledWith('canary');
    });

    test('rejects pinned when no pinned version is set', async () => {
      mockState.getPinnedVersion.mockReturnValue(null);
      const res = await app.put('/api/settings/update-channel', { channel: 'pinned' });
      expect(res.status).toBe(400);
      expect(mockState.setUpdateChannel).not.toHaveBeenCalled();
      expect(mockUpdateService.invalidate).not.toHaveBeenCalled();
    });

    test('accepts pinned when a pinned version is set', async () => {
      mockState.getPinnedVersion.mockReturnValue('0.5.2');
      const res = await app.put('/api/settings/update-channel', { channel: 'pinned' });
      expect(res.status).toBe(200);
      expect(mockState.setUpdateChannel).toHaveBeenCalledWith('pinned');
    });

    test('rejects an unknown channel id', async () => {
      const res = await app.put('/api/settings/update-channel', { channel: 'nightly' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/settings/update-pinned-version', () => {
    test('sets a semver-shaped version and invalidates cache', async () => {
      const res = await app.put('/api/settings/update-pinned-version', { version: '0.6.0' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ version: '0.6.0' });
      expect(mockState.setPinnedVersion).toHaveBeenCalledWith('0.6.0');
      expect(mockUpdateService.invalidate).toHaveBeenCalledTimes(1);
    });

    test('accepts a leading-v version (tag-style)', async () => {
      const res = await app.put('/api/settings/update-pinned-version', { version: 'v0.6.0' });
      expect(res.status).toBe(200);
      expect(mockState.setPinnedVersion).toHaveBeenCalledWith('v0.6.0');
    });

    test('accepts a prerelease suffix', async () => {
      const res = await app.put('/api/settings/update-pinned-version', {
        version: '0.6.0-rc.1',
      });
      expect(res.status).toBe(200);
      expect(mockState.setPinnedVersion).toHaveBeenCalledWith('0.6.0-rc.1');
    });

    test('clears the pinned version with null', async () => {
      const res = await app.put('/api/settings/update-pinned-version', { version: null });
      expect(res.status).toBe(200);
      expect(mockState.setPinnedVersion).toHaveBeenCalledWith(null);
      expect(mockUpdateService.invalidate).toHaveBeenCalledTimes(1);
    });

    test('rejects an obviously non-semver string', async () => {
      const res = await app.put('/api/settings/update-pinned-version', { version: 'latest' });
      expect(res.status).toBe(400);
      expect(mockState.setPinnedVersion).not.toHaveBeenCalled();
    });

    test('rejects a version containing spaces', async () => {
      const res = await app.put('/api/settings/update-pinned-version', { version: '0.6 .0' });
      expect(res.status).toBe(400);
    });
  });
});
