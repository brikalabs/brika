/**
 * Tests for the `actions.register` capability handler.
 *
 * Verifies that dispatching `actions.register` through the registry invokes
 * the `onAction` callback with the action id from the args payload. The
 * action INVOCATION path is NOT modelled as a capability — it still rides
 * the legacy `callAction` RPC (hub -> plugin) because capabilities only
 * model plugin-initiated calls.
 */

import { describe, expect, mock, test } from 'bun:test';
import { CapabilityRegistry } from '@brika/capabilities';
import type { CapabilityHandlerContext } from '@brika/capabilities';
import { buildActionsCapabilities } from '@/runtime/plugins/capabilities/actions';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'test-plugin',
    pluginRoot: '/tmp/test-plugin',
    grantedScope: {},
    log: () => undefined,
  };
}

describe('actions.register capability', () => {
  test('dispatch invokes onAction with the id and returns {}', async () => {
    const onAction = mock<(id: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildActionsCapabilities({ onAction })) {
      reg.register(cap);
    }

    const result = await reg.dispatch(
      'actions.register',
      { id: 'plugin.scan' },
      makeHandlerCtx()
    );

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]).toEqual(['plugin.scan']);
    expect(result).toEqual({});
  });

  test('dispatch rejects missing id with INVALID_ARGS', async () => {
    const onAction = mock<(id: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildActionsCapabilities({ onAction })) {
      reg.register(cap);
    }

    await expect(
      reg.dispatch('actions.register', {}, makeHandlerCtx())
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onAction).not.toHaveBeenCalled();
  });

  test('dispatch rejects a non-string id with INVALID_ARGS', async () => {
    const onAction = mock<(id: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildActionsCapabilities({ onAction })) {
      reg.register(cap);
    }

    await expect(
      reg.dispatch('actions.register', { id: 123 }, makeHandlerCtx())
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onAction).not.toHaveBeenCalled();
  });
});
