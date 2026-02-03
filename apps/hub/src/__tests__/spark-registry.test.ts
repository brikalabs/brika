/**
 * Tests for SparkRegistry
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';

// autoStub: false because we need real SparkRegistry with stubbed Logger
useTestBed({ autoStub: false });

describe('SparkRegistry', () => {
  let registry: SparkRegistry;

  beforeEach(() => {
    stub(Logger);
    registry = get(SparkRegistry);
  });

  describe('register', () => {
    test('registers a spark with full type', () => {
      registry.register({ id: 'pressed' }, '@test/switch');

      expect(registry.has('@test/switch:pressed')).toBe(true);
      expect(registry.size).toBe(1);
    });

    test('registers spark with schema', () => {
      const schema = { type: 'object', properties: { value: { type: 'number' } } };
      registry.register({ id: 'value-changed', schema }, '@test/sensor');

      const spark = registry.get('@test/sensor:value-changed');
      expect(spark?.schema).toEqual(schema);
    });

    test('handles duplicate registration with warning', () => {
      registry.register({ id: 'pressed' }, '@test/switch');
      registry.register({ id: 'pressed' }, '@test/switch');

      expect(registry.size).toBe(1); // Still only one
    });

    test('notifies listeners on registration', () => {
      const registered: string[] = [];
      registry.onSparkRegistered((type) => registered.push(type));

      registry.register({ id: 'pressed' }, '@test/switch');
      registry.register({ id: 'released' }, '@test/switch');

      expect(registered).toEqual(['@test/switch:pressed', '@test/switch:released']);
    });

    test('handles listener errors gracefully', () => {
      registry.onSparkRegistered(() => {
        throw new Error('Listener error');
      });

      // Should not throw
      expect(() => registry.register({ id: 'pressed' }, '@test/switch')).not.toThrow();
      expect(registry.size).toBe(1);
    });
  });

  describe('onSparkRegistered', () => {
    test('returns unsubscribe function', () => {
      const registered: string[] = [];
      const unsubscribe = registry.onSparkRegistered((type) => registered.push(type));

      registry.register({ id: 'first' }, '@test/plugin');
      unsubscribe();
      registry.register({ id: 'second' }, '@test/plugin');

      expect(registered).toEqual(['@test/plugin:first']);
    });

    test('supports multiple listeners', () => {
      const list1: string[] = [];
      const list2: string[] = [];

      registry.onSparkRegistered((type) => list1.push(type));
      registry.onSparkRegistered((type) => list2.push(type));

      registry.register({ id: 'test' }, '@test/plugin');

      expect(list1).toEqual(['@test/plugin:test']);
      expect(list2).toEqual(['@test/plugin:test']);
    });
  });

  describe('unregisterPlugin', () => {
    test('removes all sparks from plugin', () => {
      registry.register({ id: 'spark1' }, '@test/plugin');
      registry.register({ id: 'spark2' }, '@test/plugin');
      registry.register({ id: 'other' }, '@other/plugin');

      const count = registry.unregisterPlugin('@test/plugin');

      expect(count).toBe(2);
      expect(registry.has('@test/plugin:spark1')).toBe(false);
      expect(registry.has('@test/plugin:spark2')).toBe(false);
      expect(registry.has('@other/plugin:other')).toBe(true);
    });

    test('returns 0 for non-existent plugin', () => {
      const count = registry.unregisterPlugin('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('get', () => {
    test('returns spark by type', () => {
      registry.register({ id: 'pressed' }, '@test/switch');

      const spark = registry.get('@test/switch:pressed');

      expect(spark).toBeDefined();
      expect(spark?.id).toBe('pressed');
      expect(spark?.pluginId).toBe('@test/switch');
      expect(spark?.type).toBe('@test/switch:pressed');
    });

    test('returns undefined for non-existent spark', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('has', () => {
    test('returns true for existing spark', () => {
      registry.register({ id: 'test' }, '@test/plugin');
      expect(registry.has('@test/plugin:test')).toBe(true);
    });

    test('returns false for non-existent spark', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    test('returns all sparks sorted by type', () => {
      registry.register({ id: 'z-spark' }, '@test/plugin');
      registry.register({ id: 'a-spark' }, '@test/plugin');

      const sparks = registry.list();

      expect(sparks).toHaveLength(2);
      expect(sparks[0].id).toBe('a-spark');
      expect(sparks[1].id).toBe('z-spark');
    });

    test('returns empty array when no sparks', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('listByPlugin', () => {
    test('returns sparks for specific plugin', () => {
      registry.register({ id: 'spark1' }, '@test/plugin-a');
      registry.register({ id: 'spark2' }, '@test/plugin-a');
      registry.register({ id: 'other' }, '@test/plugin-b');

      const sparks = registry.listByPlugin('@test/plugin-a');

      expect(sparks).toHaveLength(2);
      expect(sparks.every((s) => s.pluginId === '@test/plugin-a')).toBe(true);
    });

    test('returns empty array for plugin with no sparks', () => {
      expect(registry.listByPlugin('non-existent')).toEqual([]);
    });
  });

  describe('listByOwner', () => {
    test('returns spark summaries for plugin', () => {
      registry.register({ id: 'test' }, '@test/plugin');

      const summaries = registry.listByOwner('@test/plugin');

      expect(summaries).toHaveLength(1);
      expect(summaries[0].type).toBe('@test/plugin:test');
      expect(summaries[0].pluginId).toBe('@test/plugin');
    });
  });

  describe('listSummaries', () => {
    test('returns all spark summaries', () => {
      registry.register({ id: 'spark1' }, '@test/plugin-a');
      registry.register({ id: 'spark2' }, '@test/plugin-b');

      const summaries = registry.listSummaries();

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toHaveProperty('type');
      expect(summaries[0]).toHaveProperty('pluginId');
    });
  });

  describe('getProvider', () => {
    test('returns plugin ID for spark', () => {
      registry.register({ id: 'test' }, '@test/plugin');

      expect(registry.getProvider('@test/plugin:test')).toBe('@test/plugin');
    });

    test('returns undefined for non-existent spark', () => {
      expect(registry.getProvider('non-existent')).toBeUndefined();
    });
  });

  describe('size', () => {
    test('returns correct count', () => {
      expect(registry.size).toBe(0);

      registry.register({ id: 'spark1' }, '@test/plugin');
      expect(registry.size).toBe(1);

      registry.register({ id: 'spark2' }, '@test/plugin');
      expect(registry.size).toBe(2);

      registry.unregisterPlugin('@test/plugin');
      expect(registry.size).toBe(0);
    });
  });
});
