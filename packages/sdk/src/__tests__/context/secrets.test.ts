/**
 * Tests for the secrets context module.
 *
 * Verifies the SDK delegates to the prelude bridge and surfaces BrikaError
 * throws unchanged (the channel already reconstructs typed errors on the wire).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { BrikaError, errors } from '@brika/ipc';
import { setupSecrets } from '../../context/secrets';
import { createTestHarness } from './_test-utils';

describe('setupSecrets', () => {
  const h = createTestHarness({ name: 'my-plugin' });
  let methods: ReturnType<typeof setupSecrets>['methods'];

  beforeEach(() => {
    h.reset();
    methods = setupSecrets(h.core).methods;
  });

  test('getSecret delegates to bridge.getSecret', async () => {
    h.bridge.getSecret.mockImplementation(async (_key: unknown) => 'sk-real');

    const value = await methods.getSecret('api-key');

    expect(value).toBe('sk-real');
    expect(h.bridge.getSecret).toHaveBeenCalledWith('api-key');
  });

  test('getSecret returns null for missing secrets', async () => {
    h.bridge.getSecret.mockImplementation(async () => null);

    expect(await methods.getSecret('missing')).toBeNull();
  });

  test('setSecret delegates to bridge.setSecret', async () => {
    await methods.setSecret('api-key', 'sk-new');

    expect(h.bridge.setSecret).toHaveBeenCalledWith('api-key', 'sk-new');
  });

  test('deleteSecret returns the bridge response', async () => {
    h.bridge.deleteSecret.mockImplementation(async () => true);

    expect(await methods.deleteSecret('api-key')).toBe(true);
    expect(h.bridge.deleteSecret).toHaveBeenCalledWith('api-key');
  });

  test('PERMISSION_DENIED BrikaError propagates from the bridge', async () => {
    h.bridge.getSecret.mockImplementation(async () => {
      throw errors.permissionDenied({ permission: 'secrets' });
    });

    try {
      await methods.getSecret('api-key');
      throw new Error('expected getSecret to reject');
    } catch (err) {
      if (!BrikaError.is(err, 'PERMISSION_DENIED')) {
        throw new Error(`expected PERMISSION_DENIED BrikaError, got ${String(err)}`);
      }
      expect(err.data?.permission).toBe('secrets');
    }
  });

  test('PERMISSION_DENIED on setSecret surfaces too', async () => {
    h.bridge.setSecret.mockImplementation(async () => {
      throw errors.permissionDenied({ permission: 'secrets' });
    });

    try {
      await methods.setSecret('api-key', 'value');
      throw new Error('expected setSecret to reject');
    } catch (err) {
      if (!BrikaError.is(err, 'PERMISSION_DENIED')) {
        throw new Error(`expected PERMISSION_DENIED BrikaError, got ${String(err)}`);
      }
      expect(err.data?.permission).toBe('secrets');
    }
  });
});
