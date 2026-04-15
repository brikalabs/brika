/**
 * Tests for the Bricks context module.
 *
 * Manifest validation now lives in the prelude. These tests verify
 * that the SDK module correctly delegates to the bridge.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupBricks } from '../../context/bricks';
import { createTestHarness } from './_test-utils';

describe('context/bricks', () => {
  const h = createTestHarness();

  let bricks: ReturnType<typeof setupBricks>;

  beforeEach(() => {
    h.reset();
    bricks = setupBricks(h.core);
  });

  describe('registerBrickType', () => {
    test('delegates to bridge', () => {
      const spec = { id: 'test-brick', families: ['sm', 'md'] as const };
      bricks.methods.registerBrickType(spec);
      expect(h.bridge.registerBrickType).toHaveBeenCalledWith(spec);
    });
  });

  describe('setBrickData', () => {
    test('delegates to bridge.setBrickData', () => {
      bricks.methods.setBrickData('test-brick', { value: 42 });
      expect(h.bridge.setBrickData).toHaveBeenCalledWith('test-brick', { value: 42 });
    });
  });

  describe('onBrickConfigChange', () => {
    test('delegates to bridge.onBrickConfigChange', () => {
      const handler = mock(() => {
        /* noop */
      });
      bricks.methods.onBrickConfigChange(handler);
      expect(h.bridge.onBrickConfigChange).toHaveBeenCalledWith(handler);
    });

    test('returns unsubscribe from bridge', () => {
      const unsub = mock(() => {
        /* noop */
      });
      h.bridge.onBrickConfigChange.mockReturnValue(unsub);

      const result = bricks.methods.onBrickConfigChange(() => {
        /* noop */
      });
      expect(result).toBe(unsub);
    });
  });
});
