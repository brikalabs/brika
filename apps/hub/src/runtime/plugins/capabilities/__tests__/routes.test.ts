/**
 * Tests for the `routes.register` capability handler.
 *
 * Verifies that dispatching `routes.register` through the registry invokes
 * the `onRoute` callback with the method + path from the args payload. The
 * per-request handler INVOCATION path is NOT modelled as a capability — it
 * still rides the legacy `routeRequest` RPC and is covered by the prelude
 * tests in `packages/sdk/src/__tests__/context/routes.test.ts`.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { CapabilityHandlerContext } from '@brika/capabilities';
import { CapabilityRegistry } from '@brika/capabilities';
import { buildRoutesCapabilities } from '../routes';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'test-plugin',
    pluginRoot: '/tmp/test-plugin',
    grantedScope: {},
    log: () => undefined,
  };
}

describe('routes.register capability', () => {
  test('dispatch invokes onRoute with method + path and returns {}', async () => {
    const onRoute = mock<(method: string, path: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildRoutesCapabilities({ onRoute })) {
      reg.register(cap);
    }

    const result = await reg.dispatch(
      'dev.brika.routes.register',
      { method: 'GET', path: '/status' },
      makeHandlerCtx()
    );

    expect(onRoute).toHaveBeenCalledTimes(1);
    expect(onRoute.mock.calls[0]).toEqual(['GET', '/status']);
    expect(result).toEqual({});
  });

  test('dispatch rejects an invalid method with INVALID_ARGS', async () => {
    const onRoute = mock<(method: string, path: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildRoutesCapabilities({ onRoute })) {
      reg.register(cap);
    }

    await expect(
      reg.dispatch(
        'dev.brika.routes.register',
        { method: 'PATCH', path: '/status' },
        makeHandlerCtx()
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onRoute).not.toHaveBeenCalled();
  });

  test('dispatch rejects missing path with INVALID_ARGS', async () => {
    const onRoute = mock<(method: string, path: string) => void>(() => undefined);
    const reg = new CapabilityRegistry();
    for (const cap of buildRoutesCapabilities({ onRoute })) {
      reg.register(cap);
    }

    await expect(
      reg.dispatch('dev.brika.routes.register', { method: 'GET' }, makeHandlerCtx())
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onRoute).not.toHaveBeenCalled();
  });
});
