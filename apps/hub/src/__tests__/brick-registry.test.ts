/**
 * Tests for BrickRegistry
 */

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { BrickRegistry } from '@/runtime/bricks/brick-registry';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createBrick = (id = 'thermostat') => ({
  id,
  title: 'Thermostat',
  subtitle: 'Living room',
  icon: 'thermometer',
  color: '#ff6600',
  size: 'md' as const,
  body: [
    {
      type: 'text',
      content: 'Hello',
    },
  ],
  actions: [
    {
      id: 'refresh',
      label: 'Refresh',
    },
  ],
  category: 'sensor',
  tags: [
    'temperature',
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BrickRegistry', () => {
  let registry: BrickRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BrickRegistry);
    }
  );

  describe('register', () => {
    test('registers with qualified fullId', () => {
      registry.register(createBrick(), 'plugin');

      expect(registry.has('plugin:thermostat')).toBe(true);
      expect(registry.size).toBe(1);
    });

    test('stores all fields', () => {
      registry.register(createBrick(), 'plugin');

      const brick = registry.get('plugin:thermostat');
      if (!brick) {
        throw new Error('Expected brick to be defined');
      }
      expect(brick.fullId).toBe('plugin:thermostat');
      expect(brick.id).toBe('thermostat');
      expect(brick.pluginName).toBe('plugin');
      expect(brick.title).toBe('Thermostat');
      expect(brick.subtitle).toBe('Living room');
      expect(brick.icon).toBe('thermometer');
      expect(brick.color).toBe('#ff6600');
      expect(brick.size).toBe('md');
      expect(brick.body).toHaveLength(1);
      expect(brick.actions).toHaveLength(1);
      expect(brick.category).toBe('sensor');
      expect(brick.tags).toEqual([
        'temperature',
      ]);
    });

    test('handles duplicate registration (overwrites)', () => {
      registry.register(createBrick(), 'plugin');
      registry.register(
        {
          ...createBrick(),
          title: 'Updated',
        },
        'plugin'
      );

      expect(registry.size).toBe(1);
      expect(registry.get('plugin:thermostat')?.title).toBe('Updated');
    });
  });

  describe('patch', () => {
    test('applies mutations to body', () => {
      registry.register(createBrick(), 'plugin');

      const result = registry.patch('plugin:thermostat', [
        [
          2,
          '0',
          {
            content: 'Updated',
          },
        ],
      ]);

      expect(result).toBe(true);
      expect((registry.get('plugin:thermostat')?.body[0] as Record<string, unknown>).content).toBe(
        'Updated'
      );
    });

    test('returns false for non-existent brick', () => {
      expect(registry.patch('missing:id', [])).toBe(false);
    });
  });

  describe('unregister', () => {
    test('removes single brick by fullId', () => {
      registry.register(createBrick(), 'plugin');
      expect(registry.unregister('plugin:thermostat')).toBe(true);
      expect(registry.has('plugin:thermostat')).toBe(false);
    });

    test('returns false for non-existent', () => {
      expect(registry.unregister('missing:id')).toBe(false);
    });
  });

  describe('unregisterPlugin', () => {
    test('removes all bricks for plugin and returns count', () => {
      registry.register(createBrick('a'), 'p1');
      registry.register(createBrick('b'), 'p1');
      registry.register(createBrick('c'), 'p2');

      const count = registry.unregisterPlugin('p1');

      expect(count).toBe(2);
      expect(registry.size).toBe(1);
      expect(registry.has('p2:c')).toBe(true);
    });

    test('returns 0 for non-existent plugin', () => {
      expect(registry.unregisterPlugin('missing')).toBe(0);
    });
  });

  describe('get / has / list / listByPlugin / getProvider', () => {
    test('get returns undefined for missing', () => {
      expect(registry.get('missing:id')).toBeUndefined();
    });

    test('list returns all bricks sorted by fullId', () => {
      registry.register(createBrick('z-brick'), 'plugin');
      registry.register(createBrick('a-brick'), 'plugin');

      const ids = registry.list().map((b) => b.fullId);
      expect(ids).toEqual([
        'plugin:a-brick',
        'plugin:z-brick',
      ]);
    });

    test('list returns empty array initially', () => {
      expect(registry.list()).toEqual([]);
    });

    test('listByPlugin filters correctly', () => {
      registry.register(createBrick('a'), 'p1');
      registry.register(createBrick('b'), 'p2');

      expect(registry.listByPlugin('p1')).toHaveLength(1);
      expect(registry.listByPlugin('p1')[0].id).toBe('a');
    });

    test('getProvider returns pluginName', () => {
      registry.register(createBrick(), 'my-plugin');
      expect(registry.getProvider('my-plugin:thermostat')).toBe('my-plugin');
    });

    test('getProvider returns undefined for missing', () => {
      expect(registry.getProvider('missing:id')).toBeUndefined();
    });
  });

  describe('listeners', () => {
    test('onBrickRegistered notifies on register', () => {
      const registered: string[] = [];
      registry.onBrickRegistered((id) => registered.push(id));

      registry.register(createBrick('a'), 'plugin');
      registry.register(createBrick('b'), 'plugin');

      expect(registered).toEqual([
        'plugin:a',
        'plugin:b',
      ]);
    });

    test('supports multiple listeners', () => {
      let count1 = 0;
      let count2 = 0;
      registry.onBrickRegistered(() => count1++);
      registry.onBrickRegistered(() => count2++);

      registry.register(createBrick(), 'plugin');

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    test('unsubscribe stops notifications', () => {
      const registered: string[] = [];
      const unsub = registry.onBrickRegistered((id) => registered.push(id));

      registry.register(createBrick('a'), 'plugin');
      unsub();
      registry.register(createBrick('b'), 'plugin');

      expect(registered).toEqual([
        'plugin:a',
      ]);
    });

    test('listener errors do not prevent other listeners', () => {
      const registered: string[] = [];

      registry.onBrickRegistered(() => {
        throw new Error('Listener error');
      });
      registry.onBrickRegistered((id) => registered.push(id));

      // Should not throw
      registry.register(createBrick(), 'plugin');
      expect(registered).toEqual([
        'plugin:thermostat',
      ]);
    });
  });

  describe('size', () => {
    test('tracks count', () => {
      expect(registry.size).toBe(0);
      registry.register(createBrick('a'), 'p');
      expect(registry.size).toBe(1);
      registry.unregister('p:a');
      expect(registry.size).toBe(0);
    });
  });
});
