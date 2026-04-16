/**
 * Tests for the Sparks context module.
 *
 * Manifest validation and dedup tracking now live in the prelude.
 * These tests verify that the SDK module correctly delegates to the bridge.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupSparks } from '../../context/sparks';
import { createTestHarness } from './_test-utils';

const h = createTestHarness();

describe('setupSparks', () => {
  let methods: ReturnType<typeof setupSparks>['methods'];

  beforeEach(() => {
    h.reset();
    const result = setupSparks(h.core);
    methods = result.methods;
  });

  describe('registerSpark', () => {
    test('delegates to bridge.registerSpark', () => {
      methods.registerSpark({ id: 'test-spark' });
      expect(h.bridge.registerSpark).toHaveBeenCalledWith('test-spark', undefined);
    });

    test('passes schema to bridge', () => {
      const schema = { type: 'object', properties: { temp: { type: 'number' } } };
      methods.registerSpark({ id: 'test-spark', schema });
      expect(h.bridge.registerSpark).toHaveBeenCalledWith('test-spark', schema);
    });

    test('returns id', () => {
      const result = methods.registerSpark({ id: 'test-spark' });
      expect(result).toEqual({ id: 'test-spark' });
    });
  });

  describe('emitSpark', () => {
    test('delegates to bridge.emitSpark', () => {
      methods.emitSpark('test-spark', { temperature: 22.5 });
      expect(h.bridge.emitSpark).toHaveBeenCalledWith('test-spark', { temperature: 22.5 });
    });
  });

  describe('subscribeSpark', () => {
    test('delegates to bridge.subscribeSpark', () => {
      const handler = mock(() => {
        /* noop */
      });
      methods.subscribeSpark('other-plugin:temperature', handler);

      expect(h.bridge.subscribeSpark).toHaveBeenCalledWith('other-plugin:temperature', handler);
    });

    test('returns unsubscribe from bridge', () => {
      const unsub = mock(() => {
        /* noop */
      });
      h.bridge.subscribeSpark.mockReturnValue(unsub);

      const result = methods.subscribeSpark('a:b', () => {
        /* noop */
      });
      expect(result).toBe(unsub);
    });
  });
});
