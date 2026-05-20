import { describe, expect, mock, test } from 'bun:test';
import { type CapabilityHandlerContext, CapabilityRegistry } from '@brika/capabilities';
import { buildSecretsCapabilities, type SecretsCallbacks } from '../secrets';

/**
 * The secrets capability bindings close over a `pluginName` so each spawned
 * `PluginProcess` gets its own scoped handlers. We exercise them through a
 * fresh `CapabilityRegistry` so the schema validation + dispatch wiring
 * we'll hit in production is also exercised.
 */

const PLUGIN_NAME = 'demo.plugin';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'plug-uid',
    pluginRoot: '/tmp/plug',
    grantedScope: {},
    log: () => undefined,
  };
}

function makeCallbacks(overrides: Partial<SecretsCallbacks> = {}): SecretsCallbacks {
  return {
    getSecret: mock(() => null),
    setSecret: mock(() => undefined),
    deleteSecret: mock(() => false),
    ...overrides,
  };
}

function makeRegistry(cb: SecretsCallbacks): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildSecretsCapabilities(cb, PLUGIN_NAME)) {
    reg.register(cap);
  }
  return reg;
}

describe('buildSecretsCapabilities — secrets.get', () => {
  test('returns the value from the callback wrapped in { value }', async () => {
    const getSecret = mock(() => 'super-secret');
    const reg = makeRegistry(makeCallbacks({ getSecret }));

    const result = await reg.dispatch(
      'dev.brika.secrets.get',
      { key: 'api_token' },
      makeHandlerCtx()
    );

    expect(result).toEqual({ value: 'super-secret' });
    expect(getSecret).toHaveBeenCalledTimes(1);
    expect(getSecret).toHaveBeenCalledWith(PLUGIN_NAME, 'api_token');
  });

  test('propagates a null value when the key is unset', async () => {
    const reg = makeRegistry(makeCallbacks({ getSecret: mock(() => null) }));

    const result = await reg.dispatch(
      'dev.brika.secrets.get',
      { key: 'missing' },
      makeHandlerCtx()
    );

    expect(result).toEqual({ value: null });
  });

  test('awaits async callback implementations', async () => {
    const getSecret = mock(() => Promise.resolve('async-secret'));
    const reg = makeRegistry(makeCallbacks({ getSecret }));

    const result = await reg.dispatch('dev.brika.secrets.get', { key: 'k' }, makeHandlerCtx());

    expect(result).toEqual({ value: 'async-secret' });
  });
});

describe('buildSecretsCapabilities — secrets.set', () => {
  test('forwards (pluginName, key, value) to the callback', async () => {
    const setSecret = mock(() => undefined);
    const reg = makeRegistry(makeCallbacks({ setSecret }));

    const result = await reg.dispatch(
      'dev.brika.secrets.set',
      { key: 'api_token', value: 'value-1' },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(setSecret).toHaveBeenCalledTimes(1);
    expect(setSecret).toHaveBeenCalledWith(PLUGIN_NAME, 'api_token', 'value-1');
  });

  test('awaits async callback implementations before resolving', async () => {
    let calls = 0;
    const setSecret = mock(
      () =>
        new Promise<void>((resolve) => {
          calls++;
          queueMicrotask(resolve);
        })
    );
    const reg = makeRegistry(makeCallbacks({ setSecret }));

    await reg.dispatch('dev.brika.secrets.set', { key: 'k', value: 'v' }, makeHandlerCtx());

    expect(calls).toBe(1);
  });
});

describe('buildSecretsCapabilities — secrets.delete', () => {
  test('returns { deleted: true } when the callback reports a removal', async () => {
    const deleteSecret = mock(() => true);
    const reg = makeRegistry(makeCallbacks({ deleteSecret }));

    const result = await reg.dispatch(
      'dev.brika.secrets.delete',
      { key: 'api_token' },
      makeHandlerCtx()
    );

    expect(result).toEqual({ deleted: true });
    expect(deleteSecret).toHaveBeenCalledTimes(1);
    expect(deleteSecret).toHaveBeenCalledWith(PLUGIN_NAME, 'api_token');
  });

  test('returns { deleted: false } when the key was already unset', async () => {
    const reg = makeRegistry(makeCallbacks({ deleteSecret: mock(() => false) }));

    const result = await reg.dispatch(
      'dev.brika.secrets.delete',
      { key: 'missing' },
      makeHandlerCtx()
    );

    expect(result).toEqual({ deleted: false });
  });

  test('awaits async callback implementations', async () => {
    const deleteSecret = mock(() => Promise.resolve(true));
    const reg = makeRegistry(makeCallbacks({ deleteSecret }));

    const result = await reg.dispatch('dev.brika.secrets.delete', { key: 'k' }, makeHandlerCtx());

    expect(result).toEqual({ deleted: true });
  });
});

describe('buildSecretsCapabilities — registration shape', () => {
  test('registers exactly secrets.get, secrets.set, and secrets.delete', () => {
    const caps = buildSecretsCapabilities(makeCallbacks(), PLUGIN_NAME);
    const ids = caps.map((c) => c.spec.id).sort();
    expect(ids).toEqual([
      'dev.brika.secrets.delete',
      'dev.brika.secrets.get',
      'dev.brika.secrets.set',
    ]);
  });

  test('every spec gates on the "secrets" permission', () => {
    const caps = buildSecretsCapabilities(makeCallbacks(), PLUGIN_NAME);
    for (const cap of caps) {
      expect(cap.spec.permission?.name).toBe('secrets');
    }
  });
});
