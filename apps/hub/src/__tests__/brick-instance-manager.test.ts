/**
 * Tests for BrickInstanceManager
 */

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { BrickInstanceManager } from '@/runtime/bricks/brick-instance-manager';
import { Logger } from '@/runtime/logs/log-router';

describe('BrickInstanceManager', () => {
  let manager: BrickInstanceManager;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    manager = get(BrickInstanceManager);
  });

  const mountDefault = (
    instanceId = 'inst-1',
    brickTypeId = 'plugin:brick',
    pluginName = 'plugin',
    w = 2,
    h = 2,
    config: Record<string, unknown> = {}
  ) => {
    manager.mount(instanceId, brickTypeId, pluginName, w, h, config);
  };

  describe('mount', () => {
    test('creates an instance with correct fields', () => {
      mountDefault('inst-1', 'plugin:brick', 'plugin', 3, 4, { key: 'val' });

      const instance = manager.get('inst-1');
      expect(instance).toBeDefined();
      expect(instance!.instanceId).toBe('inst-1');
      expect(instance!.brickTypeId).toBe('plugin:brick');
      expect(instance!.pluginName).toBe('plugin');
      expect(instance!.w).toBe(3);
      expect(instance!.h).toBe(4);
      expect(instance!.config).toEqual({ key: 'val' });
    });

    test('sets empty body initially', () => {
      mountDefault();
      expect(manager.get('inst-1')!.body).toEqual([]);
    });

    test('does not overwrite on duplicate mount', () => {
      mountDefault('inst-1', 'plugin:brick', 'plugin', 2, 2, { original: true });
      mountDefault('inst-1', 'plugin:other', 'other', 5, 5, { original: false });

      const instance = manager.get('inst-1');
      expect(instance!.config).toEqual({ original: true });
      expect(instance!.pluginName).toBe('plugin');
    });
  });

  describe('resize', () => {
    test('updates width and height', () => {
      mountDefault();
      const result = manager.resize('inst-1', 6, 4);

      expect(result).toBe(true);
      expect(manager.get('inst-1')!.w).toBe(6);
      expect(manager.get('inst-1')!.h).toBe(4);
    });

    test('returns false for non-existent instance', () => {
      expect(manager.resize('missing', 1, 1)).toBe(false);
    });
  });

  describe('unmount', () => {
    test('removes instance and returns true', () => {
      mountDefault();
      expect(manager.unmount('inst-1')).toBe(true);
      expect(manager.has('inst-1')).toBe(false);
    });

    test('returns false if not found', () => {
      expect(manager.unmount('missing')).toBe(false);
    });
  });

  describe('patchBody', () => {
    test('applies mutations to body', () => {
      mountDefault();
      const result = manager.patchBody('inst-1', [[0, '0', { type: 'text', content: 'Hello' }]]);

      expect(result).toBe(true);
      expect(manager.getBody('inst-1')).toHaveLength(1);
      expect((manager.getBody('inst-1')[0] as any).content).toBe('Hello');
    });

    test('returns false for non-existent instance', () => {
      expect(manager.patchBody('missing', [])).toBe(false);
    });
  });

  describe('getBody', () => {
    test('returns body for existing instance', () => {
      mountDefault();
      expect(manager.getBody('inst-1')).toEqual([]);
    });

    test('returns empty array for non-existent instance', () => {
      expect(manager.getBody('missing')).toEqual([]);
    });
  });

  describe('get / has', () => {
    test('returns instance by id', () => {
      mountDefault();
      expect(manager.get('inst-1')).toBeDefined();
    });

    test('returns undefined for missing id', () => {
      expect(manager.get('missing')).toBeUndefined();
    });

    test('has returns true for mounted instance', () => {
      mountDefault();
      expect(manager.has('inst-1')).toBe(true);
    });

    test('has returns false for missing instance', () => {
      expect(manager.has('missing')).toBe(false);
    });
  });

  describe('list / listByType', () => {
    test('list returns all instances', () => {
      mountDefault('a', 'plugin:brick', 'plugin');
      mountDefault('b', 'plugin:other', 'plugin');

      expect(manager.list()).toHaveLength(2);
    });

    test('listByType filters by brickTypeId', () => {
      mountDefault('a', 'plugin:brick', 'plugin');
      mountDefault('b', 'plugin:other', 'plugin');
      mountDefault('c', 'plugin:brick', 'plugin');

      const filtered = manager.listByType('plugin:brick');
      expect(filtered).toHaveLength(2);
      expect(filtered.map((i) => i.instanceId).sort()).toEqual(['a', 'c']);
    });
  });

  describe('unmountByType', () => {
    test('removes all instances of given type', () => {
      mountDefault('a', 'plugin:brick', 'plugin');
      mountDefault('b', 'plugin:other', 'plugin');
      mountDefault('c', 'plugin:brick', 'plugin');

      const removed = manager.unmountByType('plugin:brick');

      expect(removed.sort()).toEqual(['a', 'c']);
      expect(manager.size).toBe(1);
      expect(manager.has('b')).toBe(true);
    });

    test('returns empty array for non-existent type', () => {
      mountDefault();
      expect(manager.unmountByType('missing:type')).toEqual([]);
    });
  });

  describe('unmountByPlugin', () => {
    test('removes all instances belonging to plugin', () => {
      mountDefault('a', 'p1:brick', 'p1');
      mountDefault('b', 'p2:brick', 'p2');
      mountDefault('c', 'p1:other', 'p1');

      const removed = manager.unmountByPlugin('p1');

      expect(removed.sort()).toEqual(['a', 'c']);
      expect(manager.size).toBe(1);
      expect(manager.has('b')).toBe(true);
    });

    test('returns empty array for non-existent plugin', () => {
      expect(manager.unmountByPlugin('missing')).toEqual([]);
    });
  });

  describe('size', () => {
    test('tracks count through mount and unmount', () => {
      expect(manager.size).toBe(0);

      mountDefault('a');
      expect(manager.size).toBe(1);

      mountDefault('b', 'plugin:brick', 'plugin');
      expect(manager.size).toBe(2);

      manager.unmount('a');
      expect(manager.size).toBe(1);
    });
  });
});
