import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, useTestBed } from '@brika/di/testing';
import { PluginRouteRegistry } from '@/runtime/plugins/plugin-route-registry';

describe('PluginRouteRegistry', () => {
  let registry: PluginRouteRegistry;

  useTestBed({ autoStub: false }, () => {
    registry = get(PluginRouteRegistry);
  });

  describe('register()', () => {
    test('adds a route', () => {
      registry.register('my-plugin', 'GET', '/hello');

      const result = registry.resolve('my-plugin', 'GET', '/hello');
      expect(result).toEqual({ pluginName: 'my-plugin', method: 'GET', path: '/hello' });
    });

    test('adds multiple routes for the same plugin', () => {
      registry.register('my-plugin', 'GET', '/foo');
      registry.register('my-plugin', 'POST', '/bar');

      expect(registry.resolve('my-plugin', 'GET', '/foo')).toBeDefined();
      expect(registry.resolve('my-plugin', 'POST', '/bar')).toBeDefined();
    });

    test('overwrites an existing route with the same key', () => {
      registry.register('my-plugin', 'GET', '/hello');
      registry.register('my-plugin', 'GET', '/hello');

      const routes = registry.listByPlugin('my-plugin');
      expect(routes).toHaveLength(1);
    });
  });

  describe('resolve()', () => {
    test('finds a route by plugin, method, and path', () => {
      registry.register('alpha', 'POST', '/submit');

      const result = registry.resolve('alpha', 'POST', '/submit');
      expect(result).toEqual({ pluginName: 'alpha', method: 'POST', path: '/submit' });
    });

    test('returns undefined for unknown plugin', () => {
      registry.register('alpha', 'GET', '/foo');

      const result = registry.resolve('beta', 'GET', '/foo');
      expect(result).toBeUndefined();
    });

    test('returns undefined for unknown method', () => {
      registry.register('alpha', 'GET', '/foo');

      const result = registry.resolve('alpha', 'POST', '/foo');
      expect(result).toBeUndefined();
    });

    test('returns undefined for unknown path', () => {
      registry.register('alpha', 'GET', '/foo');

      const result = registry.resolve('alpha', 'GET', '/bar');
      expect(result).toBeUndefined();
    });

    test('returns undefined when registry is empty', () => {
      const result = registry.resolve('any', 'GET', '/any');
      expect(result).toBeUndefined();
    });
  });

  describe('resolveByPath()', () => {
    test('finds a route by method and path across all plugins', () => {
      registry.register('plugin-a', 'GET', '/oauth/callback');

      const result = registry.resolveByPath('GET', '/oauth/callback');
      expect(result).toEqual({ pluginName: 'plugin-a', method: 'GET', path: '/oauth/callback' });
    });

    test('returns the first matching route when multiple plugins register the same path', () => {
      registry.register('plugin-a', 'GET', '/shared');
      registry.register('plugin-b', 'GET', '/shared');

      const result = registry.resolveByPath('GET', '/shared');
      expect(result).toBeDefined();
      // Should return one of them (first inserted via Map iteration order)
      expect(result!.method).toBe('GET');
      expect(result!.path).toBe('/shared');
    });

    test('returns undefined for unknown method', () => {
      registry.register('plugin-a', 'GET', '/foo');

      const result = registry.resolveByPath('DELETE', '/foo');
      expect(result).toBeUndefined();
    });

    test('returns undefined for unknown path', () => {
      registry.register('plugin-a', 'GET', '/foo');

      const result = registry.resolveByPath('GET', '/unknown');
      expect(result).toBeUndefined();
    });

    test('returns undefined when registry is empty', () => {
      const result = registry.resolveByPath('GET', '/any');
      expect(result).toBeUndefined();
    });
  });

  describe('listByPlugin()', () => {
    test('returns all routes for a plugin', () => {
      registry.register('my-plugin', 'GET', '/a');
      registry.register('my-plugin', 'POST', '/b');
      registry.register('my-plugin', 'PUT', '/c');

      const routes = registry.listByPlugin('my-plugin');
      expect(routes).toHaveLength(3);
      expect(routes).toContainEqual({ pluginName: 'my-plugin', method: 'GET', path: '/a' });
      expect(routes).toContainEqual({ pluginName: 'my-plugin', method: 'POST', path: '/b' });
      expect(routes).toContainEqual({ pluginName: 'my-plugin', method: 'PUT', path: '/c' });
    });

    test('returns empty array for unknown plugin', () => {
      registry.register('other-plugin', 'GET', '/foo');

      const routes = registry.listByPlugin('unknown-plugin');
      expect(routes).toEqual([]);
    });

    test('returns empty array when registry is empty', () => {
      const routes = registry.listByPlugin('any');
      expect(routes).toEqual([]);
    });

    test('does not include routes from other plugins', () => {
      registry.register('plugin-a', 'GET', '/a');
      registry.register('plugin-b', 'GET', '/b');

      const routesA = registry.listByPlugin('plugin-a');
      expect(routesA).toHaveLength(1);
      expect(routesA[0].pluginName).toBe('plugin-a');
    });
  });

  describe('unregisterPlugin()', () => {
    test('removes all routes for a plugin', () => {
      registry.register('my-plugin', 'GET', '/a');
      registry.register('my-plugin', 'POST', '/b');

      registry.unregisterPlugin('my-plugin');

      expect(registry.listByPlugin('my-plugin')).toEqual([]);
      expect(registry.resolve('my-plugin', 'GET', '/a')).toBeUndefined();
      expect(registry.resolve('my-plugin', 'POST', '/b')).toBeUndefined();
    });

    test('does not affect other plugins', () => {
      registry.register('plugin-a', 'GET', '/a');
      registry.register('plugin-b', 'GET', '/b');

      registry.unregisterPlugin('plugin-a');

      expect(registry.listByPlugin('plugin-a')).toEqual([]);
      expect(registry.listByPlugin('plugin-b')).toHaveLength(1);
      expect(registry.resolve('plugin-b', 'GET', '/b')).toBeDefined();
    });

    test('is a no-op for unknown plugin', () => {
      registry.register('plugin-a', 'GET', '/a');

      registry.unregisterPlugin('unknown');

      expect(registry.listByPlugin('plugin-a')).toHaveLength(1);
    });

    test('is a no-op when registry is empty', () => {
      // Should not throw
      registry.unregisterPlugin('anything');
      expect(registry.listByPlugin('anything')).toEqual([]);
    });
  });
});
