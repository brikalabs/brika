import { describe, expect, mock, test } from 'bun:test';
import { CapabilityRegistry } from '@brika/capabilities';
import { buildPrefsCapabilities } from '../prefs';

function makeReg(cb: Parameters<typeof buildPrefsCapabilities>[0]): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildPrefsCapabilities(cb)) {
    reg.register(cap);
  }
  return reg;
}

const handlerCtx = {
  pluginUid: 'plug',
  pluginRoot: '/tmp/plug',
  grantedScope: undefined,
  log: () => undefined,
};

describe('prefs capability', () => {
  test('prefs.set forwards (key, value) to the callback', async () => {
    const setPreference = mock((_key: string, _value: unknown) => undefined);
    const reg = makeReg({ setPreference });

    const result = await reg.dispatch(
      'dev.brika.prefs.set',
      { key: 'debug', value: true },
      handlerCtx
    );

    expect(result).toEqual({});
    expect(setPreference).toHaveBeenCalledTimes(1);
    expect(setPreference).toHaveBeenCalledWith('debug', true);
  });

  test('prefs.set accepts any JSON-shaped value', async () => {
    const seen: Array<[string, unknown]> = [];
    const reg = makeReg({
      setPreference: (key, value) => {
        seen.push([key, value]);
      },
    });

    await reg.dispatch('dev.brika.prefs.set', { key: 'n', value: 42 }, handlerCtx);
    await reg.dispatch('dev.brika.prefs.set', { key: 's', value: 'hi' }, handlerCtx);
    await reg.dispatch('dev.brika.prefs.set', { key: 'o', value: { nested: true } }, handlerCtx);
    await reg.dispatch('dev.brika.prefs.set', { key: 'a', value: [1, 2, 3] }, handlerCtx);

    expect(seen).toEqual([
      ['n', 42],
      ['s', 'hi'],
      ['o', { nested: true }],
      ['a', [1, 2, 3]],
    ]);
  });

  test('rejects INVALID_ARGS when key is missing', async () => {
    const reg = makeReg({ setPreference: () => undefined });
    await expect(
      reg.dispatch('dev.brika.prefs.set', { value: 1 }, handlerCtx)
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
