/**
 * Tests for the `blocks.*` capability handlers.
 *
 * Covers the plugin -> hub direction (register / emit / log). The hub -> plugin
 * direction (`startBlock`/`stopBlock`/`pushInput`) stays on legacy IPC and is
 * exercised by the prelude tests, not here.
 */

import { describe, expect, mock, test } from 'bun:test';
import { type CapabilityHandlerContext, CapabilityRegistry } from '@brika/capabilities';
import type { BlockDefinitionType } from '@brika/ipc/contract';
import { type BlocksCallbacks, buildBlocksCapabilities } from '../blocks';

function makeHandlerCtx(): CapabilityHandlerContext {
  return {
    pluginUid: 'plug-uid',
    pluginRoot: '/tmp/plug',
    grantedScope: {},
    log: () => undefined,
  };
}

function makeCallbacks(overrides: Partial<BlocksCallbacks> = {}): BlocksCallbacks {
  return {
    onBlock: mock(() => undefined),
    onBlockEmit: mock(() => undefined),
    onBlockLog: mock(() => undefined),
    ...overrides,
  };
}

function makeRegistry(cb: BlocksCallbacks): CapabilityRegistry {
  const reg = new CapabilityRegistry();
  for (const cap of buildBlocksCapabilities(cb)) {
    reg.register(cap);
  }
  return reg;
}

const SAMPLE_BLOCK: BlockDefinitionType = {
  id: 'echo',
  name: 'Echo',
  category: 'utility',
  inputs: [{ id: 'in', name: 'in' }],
  outputs: [{ id: 'out', name: 'out' }],
};

describe('buildBlocksCapabilities — blocks.register', () => {
  test('forwards the block definition to onBlock and returns {}', async () => {
    const onBlock = mock<(def: BlockDefinitionType) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBlock }));

    const result = await reg.dispatch(
      'blocks.register',
      { block: SAMPLE_BLOCK },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onBlock).toHaveBeenCalledWith(SAMPLE_BLOCK);
  });

  test('rejects INVALID_ARGS when block.id is missing', async () => {
    const onBlock = mock<(def: BlockDefinitionType) => void>(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBlock }));

    await expect(
      reg.dispatch(
        'blocks.register',
        { block: { name: 'no-id', category: 'utility', inputs: [], outputs: [] } },
        makeHandlerCtx()
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onBlock).not.toHaveBeenCalled();
  });
});

describe('buildBlocksCapabilities — blocks.emit', () => {
  test('forwards (instanceId, port, data) to onBlockEmit', async () => {
    const onBlockEmit = mock<(instanceId: string, port: string, data: unknown) => void>(
      () => undefined
    );
    const reg = makeRegistry(makeCallbacks({ onBlockEmit }));

    const result = await reg.dispatch(
      'blocks.emit',
      { instanceId: 'inst-1', port: 'out', data: { value: 42 } },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onBlockEmit).toHaveBeenCalledTimes(1);
    expect(onBlockEmit).toHaveBeenCalledWith('inst-1', 'out', { value: 42 });
  });

  test('accepts any JSON-shaped payload', async () => {
    const seen: Array<unknown> = [];
    const reg = makeRegistry(
      makeCallbacks({
        onBlockEmit: (_id, _port, data) => {
          seen.push(data);
        },
      })
    );

    await reg.dispatch('blocks.emit', { instanceId: 'i', port: 'p', data: null }, makeHandlerCtx());
    await reg.dispatch('blocks.emit', { instanceId: 'i', port: 'p', data: 'hi' }, makeHandlerCtx());
    await reg.dispatch('blocks.emit', { instanceId: 'i', port: 'p', data: [1, 2] }, makeHandlerCtx());

    expect(seen).toEqual([null, 'hi', [1, 2]]);
  });
});

describe('buildBlocksCapabilities — blocks.log', () => {
  test('forwards (instanceId, workflowId, level, message) to onBlockLog', async () => {
    const onBlockLog =
      mock<
        (
          instanceId: string,
          workflowId: string,
          level: 'debug' | 'info' | 'warn' | 'error',
          message: string
        ) => void
      >(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBlockLog }));

    const result = await reg.dispatch(
      'blocks.log',
      { instanceId: 'inst-1', workflowId: 'wf-1', level: 'info', message: 'hello' },
      makeHandlerCtx()
    );

    expect(result).toEqual({});
    expect(onBlockLog).toHaveBeenCalledTimes(1);
    expect(onBlockLog).toHaveBeenCalledWith('inst-1', 'wf-1', 'info', 'hello');
  });

  test('rejects INVALID_ARGS for an unknown log level', async () => {
    const onBlockLog =
      mock<
        (
          instanceId: string,
          workflowId: string,
          level: 'debug' | 'info' | 'warn' | 'error',
          message: string
        ) => void
      >(() => undefined);
    const reg = makeRegistry(makeCallbacks({ onBlockLog }));

    await expect(
      reg.dispatch(
        'blocks.log',
        { instanceId: 'i', workflowId: 'w', level: 'trace', message: 'x' },
        makeHandlerCtx()
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(onBlockLog).not.toHaveBeenCalled();
  });
});

describe('buildBlocksCapabilities — registration shape', () => {
  test('registers exactly blocks.register, blocks.emit, and blocks.log', () => {
    const caps = buildBlocksCapabilities(makeCallbacks());
    const ids = caps.map((c) => c.spec.id).sort();
    expect(ids).toEqual(['blocks.emit', 'blocks.log', 'blocks.register']);
  });

  test('every spec gates on the "blocks" permission', () => {
    const caps = buildBlocksCapabilities(makeCallbacks());
    for (const cap of caps) {
      expect(cap.spec.permission?.name).toBe('blocks');
    }
  });
});
