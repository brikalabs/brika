/**
 * Tests for BrickTypeRegistry
 */

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import type { BrickFamily } from '@brika/shared';
import { BrickTypeRegistry } from '@/runtime/bricks/brick-type-registry';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createBrickType = (id = 'thermostat') => ({
  id,
  families: ['sm', 'md'] as BrickFamily[],
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 4 },
});

const createManifest = (name = 'Thermostat') => ({
  name,
  description: 'Temperature display',
  category: 'sensor',
  icon: 'thermometer',
  color: '#ff6600',
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BrickTypeRegistry', () => {
  let registry: BrickTypeRegistry;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    registry = get(BrickTypeRegistry);
  });

  describe('register', () => {
    test('registers with full qualified ID', () => {
      const fullId = registry.register(createBrickType(), 'plugin-thermo', createManifest());

      expect(fullId).toBe('plugin-thermo:thermostat');
      expect(registry.has('plugin-thermo:thermostat')).toBe(true);
    });

    test('stores metadata from manifest', () => {
      registry.register(createBrickType(), 'plugin', createManifest('My Brick'));

      const type = registry.get('plugin:thermostat');
      expect(type).toBeDefined();
      expect(type!.name).toBe('My Brick');
      expect(type!.description).toBe('Temperature display');
      expect(type!.category).toBe('sensor');
      expect(type!.icon).toBe('thermometer');
      expect(type!.color).toBe('#ff6600');
    });

    test('stores families and size constraints', () => {
      registry.register(createBrickType(), 'plugin', createManifest());

      const type = registry.get('plugin:thermostat')!;
      expect(type.families).toEqual(['sm', 'md']);
      expect(type.minSize).toEqual({ w: 1, h: 1 });
      expect(type.maxSize).toEqual({ w: 6, h: 4 });
    });

    test('stores config schema', () => {
      const brickType = { ...createBrickType(), config: [{ id: 'unit', type: 'text' }] };
      registry.register(brickType, 'plugin', createManifest());

      expect(registry.get('plugin:thermostat')!.config).toHaveLength(1);
    });

    test('handles duplicate registration (overwrites)', () => {
      registry.register(createBrickType(), 'plugin', createManifest('V1'));
      registry.register(createBrickType(), 'plugin', createManifest('V2'));

      expect(registry.size).toBe(1);
      expect(registry.get('plugin:thermostat')!.name).toBe('V2');
    });

    test('returns full ID', () => {
      const id = registry.register(createBrickType('gauge'), 'sensor-plugin');
      expect(id).toBe('sensor-plugin:gauge');
    });
  });

  describe('get / has', () => {
    test('returns registered type by fullId', () => {
      registry.register(createBrickType(), 'plugin', createManifest());
      expect(registry.get('plugin:thermostat')).toBeDefined();
    });

    test('returns undefined for non-existent', () => {
      expect(registry.get('missing:type')).toBeUndefined();
    });

    test('has returns false for non-existent', () => {
      expect(registry.has('missing:type')).toBe(false);
    });
  });

  describe('list', () => {
    test('returns all types sorted by fullId', () => {
      registry.register(createBrickType('z-brick'), 'plugin');
      registry.register(createBrickType('a-brick'), 'plugin');

      const ids = registry.list().map((t) => t.fullId);
      expect(ids).toEqual(['plugin:a-brick', 'plugin:z-brick']);
    });

    test('returns empty array initially', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('listByPlugin', () => {
    test('filters by pluginName', () => {
      registry.register(createBrickType('a'), 'p1');
      registry.register(createBrickType('b'), 'p2');
      registry.register(createBrickType('c'), 'p1');

      const result = registry.listByPlugin('p1');
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.localId).sort()).toEqual(['a', 'c']);
    });

    test('returns empty for unknown plugin', () => {
      expect(registry.listByPlugin('missing')).toEqual([]);
    });
  });

  describe('unregisterPlugin', () => {
    test('removes all types for the plugin', () => {
      registry.register(createBrickType('a'), 'p1');
      registry.register(createBrickType('b'), 'p1');
      registry.register(createBrickType('c'), 'p2');

      const removed = registry.unregisterPlugin('p1');

      expect(removed.sort()).toEqual(['p1:a', 'p1:b']);
      expect(registry.size).toBe(1);
      expect(registry.has('p2:c')).toBe(true);
    });

    test('returns empty array for non-existent plugin', () => {
      expect(registry.unregisterPlugin('missing')).toEqual([]);
    });
  });

  describe('getProvider', () => {
    test('returns pluginName for registered type', () => {
      registry.register(createBrickType(), 'my-plugin');
      expect(registry.getProvider('my-plugin:thermostat')).toBe('my-plugin');
    });

    test('returns undefined for non-existent', () => {
      expect(registry.getProvider('missing:type')).toBeUndefined();
    });
  });

  describe('size', () => {
    test('tracks count through registration and unregistration', () => {
      expect(registry.size).toBe(0);

      registry.register(createBrickType('a'), 'p1');
      expect(registry.size).toBe(1);

      registry.register(createBrickType('b'), 'p1');
      expect(registry.size).toBe(2);

      registry.unregisterPlugin('p1');
      expect(registry.size).toBe(0);
    });
  });
});
