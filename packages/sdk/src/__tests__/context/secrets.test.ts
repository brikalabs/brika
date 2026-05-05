/**
 * Tests for the secrets context module.
 *
 * Verifies the SDK delegates to the prelude bridge and propagates
 * RpcErrors through the typed error mapper.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { setupSecrets } from '../../context/secrets';
import { PermissionDeniedError } from '../../errors';
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

  test('PERMISSION_DENIED RpcError surfaces as PermissionDeniedError', async () => {
    const rpcError = Object.assign(new Error('Permission "secrets" is not granted'), {
      code: 'PERMISSION_DENIED',
    });
    h.bridge.getSecret.mockImplementation(async () => {
      throw rpcError;
    });

    await expect(methods.getSecret('api-key')).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test('PERMISSION_DENIED on setSecret surfaces too', async () => {
    const rpcError = Object.assign(new Error('Permission "secrets" is not granted'), {
      code: 'PERMISSION_DENIED',
    });
    h.bridge.setSecret.mockImplementation(async () => {
      throw rpcError;
    });

    await expect(methods.setSecret('api-key', 'value')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });
});
