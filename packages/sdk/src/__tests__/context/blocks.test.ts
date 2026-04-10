/**
 * Tests for the blocks context module (setupBlocks).
 *
 * Tests block registration, reactive block lifecycle (startBlock, pushInput,
 * stopBlock), and cleanup. Exercises setupBlocks() directly without mock.module.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestHarness, type Handler } from './_test-utils';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const h = createTestHarness({
  blocks: [
    {
      id: 'test-block',
      name: 'Test Block',
      category: 'test',
    },
  ],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlockDef(overrides?: Record<string, unknown>) {
  return {
    id: 'test-block',
    inputs: [
      {
        id: 'in',
        name: 'Input',
        direction: 'input' as const,
        typeName: 'number',
      },
    ],
    outputs: [
      {
        id: 'out',
        name: 'Output',
        direction: 'output' as const,
        typeName: 'string',
      },
    ],
    schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

// Import setupBlocks directly — no mock.module needed
import { setupBlocks } from '../../context/blocks';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupBlocks', () => {
  let methods: ReturnType<typeof setupBlocks>['methods'];
  let stop: ReturnType<typeof setupBlocks>['stop'];

  beforeEach(() => {
    h.reset();

    const result = setupBlocks(h.core);
    methods = result.methods;
    stop = result.stop;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // registerBlock
  // ─────────────────────────────────────────────────────────────────────────

  describe('registerBlock', () => {
    test('sends IPC with block metadata merged from manifest', () => {
      const result = methods.registerBlock(makeBlockDef());

      expect(result).toEqual({
        id: 'test-block',
      });

      const msg = h.sentMessages.find((m) => m.name === 'registerBlock');
      expect(msg).toBeDefined();

      const payload = msg?.payload as {
        block: Record<string, unknown>;
      };
      expect(payload.block.id).toBe('test-block');
      expect(payload.block.name).toBe('Test Block');
      expect(payload.block.category).toBe('test');
      expect(payload.block.inputs).toEqual([
        {
          id: 'in',
          name: 'in',
          typeName: 'number',
          type: undefined,
          jsonSchema: undefined,
        },
      ]);
      expect(payload.block.outputs).toEqual([
        {
          id: 'out',
          name: 'out',
          typeName: 'string',
          type: undefined,
          jsonSchema: undefined,
        },
      ]);
    });

    test('throws for undeclared block', () => {
      expect(() =>
        methods.registerBlock(
          makeBlockDef({
            id: 'unknown-block',
          })
        )
      ).toThrow('Block "unknown-block" not in package.json');
    });

    test('throws for duplicate registration', () => {
      methods.registerBlock(makeBlockDef());

      expect(() => methods.registerBlock(makeBlockDef())).toThrow(
        'Block "test-block" already registered'
      );
    });

    test('sends type descriptor and jsonSchema in IPC message', () => {
      methods.registerBlock(
        makeBlockDef({
          inputs: [
            {
              id: 'in',
              name: 'Input',
              direction: 'input' as const,
              typeName: 'generic<T>',
              type: { kind: 'generic', typeVar: 'T' },
            },
          ],
          outputs: [
            {
              id: 'out',
              name: 'Output',
              direction: 'output' as const,
              typeName: '__passthrough:in',
              type: { kind: 'passthrough', sourcePortId: 'in' },
              jsonSchema: undefined,
            },
          ],
        })
      );

      const msg = h.sentMessages.find((m) => m.name === 'registerBlock');
      const payload = msg?.payload as { block: Record<string, unknown> };
      const inputs = payload.block.inputs as Array<Record<string, unknown>>;
      const outputs = payload.block.outputs as Array<Record<string, unknown>>;

      expect(inputs[0]?.type).toEqual({ kind: 'generic', typeVar: 'T' });
      expect(outputs[0]?.type).toEqual({ kind: 'passthrough', sourcePortId: 'in' });
    });

    test('registers block with start function (reactive block)', () => {
      const startFn = mock(() => ({
        pushInput: () => {
          /* noop */
        },
        stop: () => {
          /* noop */
        },
      }));

      methods.registerBlock(
        makeBlockDef({
          start: startFn,
        })
      );

      // The block should be startable through the startBlock IPC handler
      const result = h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-1',
        workflowId: 'wf-1',
        config: {},
      });

      expect(result).toEqual({
        ok: true,
      });
      expect(startFn).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // startBlock IPC
  // ─────────────────────────────────────────────────────────────────────────

  describe('startBlock IPC', () => {
    const mockPushInput = mock((_port: string, _data: unknown) => {
      /* noop */
    });
    const mockInstanceStop = mock(() => {
      /* noop */
    });
    const mockStartFn = mock(() => ({
      pushInput: mockPushInput,
      stop: mockInstanceStop,
    }));

    beforeEach(() => {
      mockPushInput.mockClear();
      mockInstanceStop.mockClear();
      mockStartFn.mockClear();

      methods.registerBlock(
        makeBlockDef({
          start: mockStartFn,
        })
      );
    });

    test('extracts local ID from plugin:blockId, calls start, returns ok', () => {
      const result = h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-1',
        workflowId: 'wf-1',
        config: {
          key: 'value',
        },
      });

      expect(result).toEqual({
        ok: true,
      });
      expect(mockStartFn).toHaveBeenCalledTimes(1);

      const callArgs = (mockStartFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(callArgs.blockId).toBe('inst-1');
      expect(callArgs.workflowId).toBe('wf-1');
      expect(callArgs.config).toEqual({
        key: 'value',
      });
      expect(typeof callArgs.emit).toBe('function');
    });

    test('handles local ID without colon', () => {
      const result = h.callImpl('startBlock', {
        blockType: 'test-block',
        instanceId: 'inst-2',
        workflowId: 'wf-1',
        config: {},
      });

      expect(result).toEqual({
        ok: true,
      });
      expect(mockStartFn).toHaveBeenCalledTimes(1);
    });

    test('returns error for unknown block', () => {
      const result = h.callImpl('startBlock', {
        blockType: 'test-plugin:nonexistent',
        instanceId: 'inst-3',
        workflowId: 'wf-1',
        config: {},
      });

      expect(result).toEqual({
        ok: false,
        error: 'Block not found: nonexistent',
      });
    });

    test('returns error for duplicate instance', () => {
      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-dup',
        workflowId: 'wf-1',
        config: {},
      });

      const result = h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-dup',
        workflowId: 'wf-1',
        config: {},
      });

      expect(result).toEqual({
        ok: false,
        error: 'Block instance already exists: inst-dup',
      });
    });

    test('handles start errors', () => {
      mockStartFn.mockImplementationOnce(() => {
        throw new Error('start failed');
      });

      const result = h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-err',
        workflowId: 'wf-1',
        config: {},
      });

      expect(result).toEqual({
        ok: false,
        error: 'Error: start failed',
      });
    });

    test('emit callback sends blockEmit IPC', () => {
      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-emit',
        workflowId: 'wf-1',
        config: {},
      });

      const callArgs = (mockStartFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const emit = callArgs.emit as Function;
      emit('out', {
        value: 42,
      });

      const emitMsg = h.sentMessages.find((m) => m.name === 'blockEmit');
      expect(emitMsg).toBeDefined();
      expect(emitMsg?.payload).toEqual({
        instanceId: 'inst-emit',
        port: 'out',
        data: {
          value: 42,
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // pushInput
  // ─────────────────────────────────────────────────────────────────────────

  describe('pushInput', () => {
    const mockPushInput = mock((_port: string, _data: unknown) => {
      /* noop */
    });
    const mockInstanceStop = mock(() => {
      /* noop */
    });

    beforeEach(() => {
      mockPushInput.mockClear();
      mockInstanceStop.mockClear();

      const startFn = mock(() => ({
        pushInput: mockPushInput,
        stop: mockInstanceStop,
      }));

      methods.registerBlock(
        makeBlockDef({
          start: startFn,
        })
      );

      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-push',
        workflowId: 'wf-1',
        config: {},
      });
    });

    test('forwards data to instance', () => {
      h.triggerOn('pushInput', {
        instanceId: 'inst-push',
        port: 'in',
        data: 42,
      });

      expect(mockPushInput).toHaveBeenCalledWith('in', 42);
    });

    test('ignores unknown instance', () => {
      // Should not throw
      h.triggerOn('pushInput', {
        instanceId: 'nonexistent',
        port: 'in',
        data: 42,
      });
      expect(mockPushInput).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stopBlock
  // ─────────────────────────────────────────────────────────────────────────

  describe('stopBlock', () => {
    const mockPushInput = mock((_port: string, _data: unknown) => {
      /* noop */
    });
    const mockInstanceStop = mock(() => {
      /* noop */
    });

    beforeEach(() => {
      mockPushInput.mockClear();
      mockInstanceStop.mockClear();

      const startFn = mock(() => ({
        pushInput: mockPushInput,
        stop: mockInstanceStop,
      }));

      methods.registerBlock(
        makeBlockDef({
          start: startFn,
        })
      );

      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-stop',
        workflowId: 'wf-1',
        config: {},
      });
    });

    test('stops instance and removes it', () => {
      h.triggerOn('stopBlock', {
        instanceId: 'inst-stop',
      });

      expect(mockInstanceStop).toHaveBeenCalledTimes(1);

      // Instance should be gone — pushInput should be a no-op
      mockPushInput.mockClear();
      h.triggerOn('pushInput', {
        instanceId: 'inst-stop',
        port: 'in',
        data: 1,
      });
      expect(mockPushInput).not.toHaveBeenCalled();
    });

    test('ignores unknown instance', () => {
      // Should not throw
      h.triggerOn('stopBlock', {
        instanceId: 'nonexistent',
      });
      expect(mockInstanceStop).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // stop() — module-level cleanup
  // ─────────────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    test('cleans up all running instances', () => {
      const stopFns: Array<ReturnType<typeof mock>> = [];

      const startFn = mock(() => {
        const instanceStop = mock(() => {
          /* noop */
        });
        stopFns.push(instanceStop);
        return {
          pushInput: () => {
            /* noop */
          },
          stop: instanceStop,
        };
      });

      methods.registerBlock(
        makeBlockDef({
          start: startFn,
        })
      );

      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-a',
        workflowId: 'wf-1',
        config: {},
      });

      h.callImpl('startBlock', {
        blockType: 'test-plugin:test-block',
        instanceId: 'inst-b',
        workflowId: 'wf-2',
        config: {},
      });

      expect(stopFns).toHaveLength(2);

      stop();

      for (const fn of stopFns) {
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });
  });
});
