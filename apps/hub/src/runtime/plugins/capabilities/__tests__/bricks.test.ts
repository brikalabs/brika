/**
 * Tests for the `bricks.*` capability handlers.
 *
 * Verifies that dispatching `bricks.registerType` and `bricks.pushData`
 * through the registry invokes the matching callbacks with the args payload.
 * The reverse directions (`brickInstanceAction`, `updateBrickConfig`) are
 * NOT modelled as capabilities — they stay on the legacy IPC contract and
 * are covered by the plugin-process tests.
 */

import { describe, expect, mock, test } from 'bun:test';
import { type CapabilityHandlerContext, CapabilityRegistry } from '@brika/capabilities';
import type { BrickTypeDefinitionType } from '@brika/ipc/contract';
import { type BricksCallbacks, buildBricksCapabilities } from '../bricks';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'test-plugin',
    pluginRoot: '/tmp/test-plugin',
    grantedScope: {},
    log: () => undefined,
  };
}

function makeCallbacks(overrides: Partial<BricksCallbacks> = {}): BricksCallbacks {
  return {
    onBrickType: mock(() => undefined),
    onBrickDataPush: mock(() => undefined),
    ...overrides,
  };
}

function makeRegistry(cb: BricksCallbacks): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildBricksCapabilities(cb)) {
    reg.register(cap);
  }
  return reg;
}

describe('buildBricksCapabilities — bricks.registerType', () => {
  test('dispatch invokes onBrickType with the definition and returns {}', async () => {
    const onBrickType = mock<(def: BrickTypeDefinitionType) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBrickType }));

    const brickType: BrickTypeDefinitionType = {
      id: 'weather',
      families: ['sm', 'md'],
      minSize: { w: 1, h: 1 },
      maxSize: { w: 4, h: 4 },
    };

    const result = await reg.dispatch(
      'dev.brika.bricks.registerType',
      { brickType },
      makeHandlerCtx()
    );

    expect(onBrickType).toHaveBeenCalledTimes(1);
    expect(onBrickType).toHaveBeenCalledWith(brickType);
    expect(result).toEqual({});
  });

  test('accepts a minimal definition with only id and families', async () => {
    const onBrickType = mock<(def: BrickTypeDefinitionType) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBrickType }));

    const brickType: BrickTypeDefinitionType = {
      id: 'minimal',
      families: ['lg'],
    };

    const result = await reg.dispatch(
      'dev.brika.bricks.registerType',
      { brickType },
      makeHandlerCtx()
    );

    expect(onBrickType).toHaveBeenCalledWith(brickType);
    expect(result).toEqual({});
  });
});

describe('buildBricksCapabilities — bricks.pushData', () => {
  test('dispatch invokes onBrickDataPush with (brickTypeId, data) and returns {}', async () => {
    const onBrickDataPush = mock<(brickTypeId: string, data: unknown) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBrickDataPush }));

    const result = await reg.dispatch(
      'dev.brika.bricks.pushData',
      { brickTypeId: 'weather', data: { temp: 21, conditions: 'sunny' } },
      makeHandlerCtx()
    );

    expect(onBrickDataPush).toHaveBeenCalledTimes(1);
    expect(onBrickDataPush).toHaveBeenCalledWith('weather', { temp: 21, conditions: 'sunny' });
    expect(result).toEqual({});
  });

  test('forwards arbitrary data shapes unchanged', async () => {
    const seen: Array<[string, unknown]> = [];
    const reg = makeRegistry(
      makeCallbacks({
        onBrickDataPush: (id, data) => {
          seen.push([id, data]);
        },
      })
    );

    await reg.dispatch(
      'dev.brika.bricks.pushData',
      { brickTypeId: 'a', data: null },
      makeHandlerCtx()
    );
    await reg.dispatch(
      'dev.brika.bricks.pushData',
      { brickTypeId: 'b', data: 42 },
      makeHandlerCtx()
    );
    await reg.dispatch(
      'dev.brika.bricks.pushData',
      { brickTypeId: 'c', data: [1, 2, 3] },
      makeHandlerCtx()
    );

    expect(seen).toEqual([
      ['a', null],
      ['b', 42],
      ['c', [1, 2, 3]],
    ]);
  });
});

describe('buildBricksCapabilities — INVALID_ARGS', () => {
  test('dispatch rejects bricks.registerType when brickType.id is missing', async () => {
    const onBrickType = mock<(def: BrickTypeDefinitionType) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBrickType }));

    await expect(
      reg.dispatch(
        'dev.brika.bricks.registerType',
        { brickType: { families: ['sm'] } },
        makeHandlerCtx()
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onBrickType).not.toHaveBeenCalled();
  });
});

describe('buildBricksCapabilities — registration shape', () => {
  test('registers exactly bricks.registerType and bricks.pushData', () => {
    const caps = buildBricksCapabilities(makeCallbacks());
    const ids = caps.map((c) => c.spec.id).sort();
    expect(ids).toEqual(['dev.brika.bricks.pushData', 'dev.brika.bricks.registerType']);
  });

  test('every spec gates on the "bricks" permission', () => {
    const caps = buildBricksCapabilities(makeCallbacks());
    for (const cap of caps) {
      expect(cap.spec.permission?.name).toBe('bricks');
    }
  });
});
