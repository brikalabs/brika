/**
 * Tests for the blocks context module (setupBlocks).
 *
 * Block registration, instance lifecycle (startBlock, pushInput, stopBlock),
 * and IPC messaging all live in the prelude. These tests verify that the
 * SDK module correctly delegates to bridge.registerBlock().
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestHarness } from './_test-utils';

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
// Import under test
// ---------------------------------------------------------------------------

import { setupBlocks } from '../../context/blocks';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupBlocks', () => {
  let methods: ReturnType<typeof setupBlocks>['methods'];

  beforeEach(() => {
    h.reset();
    const result = setupBlocks(h.core);
    methods = result.methods;
  });

  describe('registerBlock', () => {
    test('delegates to bridge.registerBlock', () => {
      const block = {
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
      };

      h.bridge.registerBlock.mockReturnValue({ id: 'test-block' });
      const result = methods.registerBlock(block);

      expect(h.bridge.registerBlock).toHaveBeenCalledTimes(1);
      expect(h.bridge.registerBlock).toHaveBeenCalledWith(block);
      expect(result).toEqual({ id: 'test-block' });
    });

    test('passes start function through to bridge', () => {
      const startFn = () => ({
        pushInput: () => {
          /* noop */
        },
        stop: () => {
          /* noop */
        },
      });

      const block = {
        id: 'test-block',
        inputs: [],
        outputs: [],
        schema: { type: 'object' as const, properties: {}, required: [] },
        start: startFn,
      };

      h.bridge.registerBlock.mockReturnValue({ id: 'test-block' });
      methods.registerBlock(block);

      const callArg = h.bridge.registerBlock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg.start).toBe(startFn);
    });

    test('propagates bridge errors', () => {
      h.bridge.registerBlock.mockImplementation(() => {
        throw new Error('Block "unknown" not in package.json');
      });

      expect(() =>
        methods.registerBlock({
          id: 'unknown',
          inputs: [],
          outputs: [],
          schema: { type: 'object' as const, properties: {}, required: [] },
        })
      ).toThrow('Block "unknown" not in package.json');
    });
  });

  test('no stop function returned (prelude owns instance lifecycle)', () => {
    const result = setupBlocks(h.core);
    expect(result).not.toHaveProperty('stop');
  });
});
