/**
 * Tests for PluginEventHandler
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Analytics } from '@brika/analytics';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { BrickTypeRegistry } from '@/runtime/bricks';
import { BrickDataStore } from '@/runtime/bricks/brick-data-store';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { PluginRouteRegistry } from '@/runtime/plugins/plugin-route-registry';
import { SparkRegistry } from '@/runtime/sparks';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({
  autoStub: false,
});

describe('PluginEventHandler', () => {
  let handler: PluginEventHandler;
  let mockBlockRegistry: {
    register: ReturnType<typeof mock>;
  };
  let mockSparkRegistry: {
    register: ReturnType<typeof mock>;
    has: ReturnType<typeof mock>;
  };
  let mockStateStore: {
    setHealth: ReturnType<typeof mock>;
  };
  let mockEventSystem: {
    dispatch: ReturnType<typeof mock>;
    subscribe: ReturnType<typeof mock>;
  };
  let mockBrickTypeRegistry: {
    register: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };
  let mockBrickDataStore: {
    set: ReturnType<typeof mock>;
    removeByPlugin: ReturnType<typeof mock>;
  };
  let mockPluginRouteRegistry: {
    register: ReturnType<typeof mock>;
  };
  // The PluginEventHandler does `inject(Analytics).withSource('plugin').capture(...)`.
  // Mock both legs so we can assert what the scoped service actually saw.
  let scopedCapture: ReturnType<typeof mock>;

  beforeEach(() => {
    mockBlockRegistry = {
      register: mock(),
    };
    mockSparkRegistry = {
      register: mock(),
      has: mock().mockReturnValue(true),
    };
    mockStateStore = {
      setHealth: mock(),
    };
    mockEventSystem = {
      dispatch: mock(),
      subscribe: mock().mockReturnValue(() => undefined),
    };
    mockBrickTypeRegistry = {
      register: mock().mockReturnValue({ fullId: 'plugin:brick', isNew: true }),
      get: mock().mockReturnValue({
        fullId: 'plugin:brick',
        localId: 'brick',
        pluginName: 'plugin',
      }),
    };
    mockBrickDataStore = {
      set: mock(),
      removeByPlugin: mock(),
    };
    mockPluginRouteRegistry = {
      register: mock(),
    };

    stub(Logger);
    scopedCapture = mock();
    stub(Analytics, {
      withSource: mock().mockReturnValue({ capture: scopedCapture }),
    });
    provide(BlockRegistry, mockBlockRegistry);
    provide(SparkRegistry, mockSparkRegistry);
    provide(StateStore, mockStateStore);
    provide(EventSystem, mockEventSystem);
    provide(BrickTypeRegistry, mockBrickTypeRegistry);
    provide(BrickDataStore, mockBrickDataStore);
    provide(PluginRouteRegistry, mockPluginRouteRegistry);

    handler = get(PluginEventHandler);
  });

  describe('block emit handler', () => {
    test('setBlockEmitHandler sets the handler', () => {
      const emitHandler = mock();
      handler.setBlockEmitHandler(emitHandler);

      handler.onBlockEmit('instance-1', 'output', {
        value: 42,
      });

      expect(emitHandler.mock.calls.length > 0).toBe(true);
      expect(emitHandler.mock.calls[emitHandler.mock.calls.length - 1]).toEqual([
        'instance-1',
        'output',
        {
          value: 42,
        },
      ]);
    });

    test('clearBlockEmitHandler removes the handler', () => {
      const emitHandler = mock();
      handler.setBlockEmitHandler(emitHandler);
      handler.clearBlockEmitHandler();

      handler.onBlockEmit('instance-1', 'output', {
        value: 42,
      });

      expect(emitHandler.mock.calls.length > 0).toBe(false);
    });

    test('onBlockEmit does nothing when no handler set', () => {
      // Should not throw
      expect(() => handler.onBlockEmit('instance-1', 'output', {})).not.toThrow();
    });

    test('fans out to every registered handler (concurrent workflows)', () => {
      const a = mock();
      const b = mock();
      handler.setBlockEmitHandler(a);
      handler.setBlockEmitHandler(b);

      handler.onBlockEmit('instance-1', 'output', { value: 1 });

      expect(a.mock.calls.length).toBe(1);
      expect(b.mock.calls.length).toBe(1);
    });

    test('clearBlockEmitHandler(handler) removes only that handler', () => {
      const a = mock();
      const b = mock();
      handler.setBlockEmitHandler(a);
      handler.setBlockEmitHandler(b);

      // Workflow A stops: only A's handler must be removed; B keeps receiving.
      handler.clearBlockEmitHandler(a);
      handler.onBlockEmit('instance-1', 'output', { value: 1 });

      expect(a.mock.calls.length).toBe(0);
      expect(b.mock.calls.length).toBe(1);
    });
  });

  describe('block log handler', () => {
    test('setBlockLogHandler sets the handler', () => {
      const logHandler = mock();
      handler.setBlockLogHandler(logHandler);

      handler.onBlockLog('instance-1', 'workflow-1', 'info', 'Test message');

      expect(logHandler.mock.calls.length > 0).toBe(true);
      expect(logHandler.mock.calls[logHandler.mock.calls.length - 1]).toEqual([
        'instance-1',
        'workflow-1',
        'info',
        'Test message',
      ]);
    });

    test('clearBlockLogHandler removes the handler', () => {
      const logHandler = mock();
      handler.setBlockLogHandler(logHandler);
      handler.clearBlockLogHandler();

      handler.onBlockLog('instance-1', 'workflow-1', 'info', 'Test message');

      expect(logHandler.mock.calls.length > 0).toBe(false);
    });

    test('onBlockLog does nothing when no handler set', () => {
      // Should not throw
      expect(() => handler.onBlockLog('instance-1', 'workflow-1', 'info', 'Test')).not.toThrow();
    });
  });

  describe('onPluginReady', () => {
    test('sets health status and dispatches event', () => {
      const mockProcess = {
        name: '@test/plugin',
        uid: 'uid-123',
        version: '1.0.0',
        pid: 12345,
      } as PluginProcess;

      handler.onPluginReady(mockProcess);

      expect(
        mockStateStore.setHealth.mock.calls.some(
          (call: unknown[]) => call[0] === '@test/plugin' && call[1] === 'running'
        )
      ).toBe(true);
      expect(mockEventSystem.dispatch.mock.calls.length > 0).toBe(true);
    });
  });

  describe('onPluginLog', () => {
    test('emits log entry', () => {
      handler.onPluginLog('@test/plugin', 'info', 'Test log message', {
        key: 'value',
      });

      // Logger emit should be called (via the mock)
      // We can verify it doesn't throw
    });

    test('handles log without meta', () => {
      // Should not throw
      expect(() => handler.onPluginLog('@test/plugin', 'warn', 'Warning message')).not.toThrow();
    });
  });

  describe('onPluginCapture', () => {
    test('forwards plugin-originated events to the scoped Analytics', () => {
      // The plugin → hub IPC `capture` message lands here. Pin the contract
      // so a regression doesn't silently strand the entire plugin analytics
      // surface (plugins can call `capture(...)` but events would never
      // reach the hub).
      handler.onPluginCapture('@test/plugin', 'timer.started', { durationMs: 5000 }, 'sess-9');

      expect(scopedCapture).toHaveBeenCalledTimes(1);
      const [name, props, options] = scopedCapture.mock.calls[0] ?? [];
      expect(name).toBe('timer.started');
      expect(props).toEqual({ durationMs: 5000 });
      expect(options).toMatchObject({
        pluginName: '@test/plugin',
        // Plugin-supplied distinct ids are namespaced so they can't spoof a
        // UI session's anonymous device id.
        distinctId: 'plugin:@test/plugin:sess-9',
      });
      // ts should be stamped server-side; just confirm it's a number.
      expect(typeof options.ts).toBe('number');
    });

    test('handles capture with no props and no distinctId', () => {
      expect(() => handler.onPluginCapture('@test/plugin', 'feature.used')).not.toThrow();
      expect(scopedCapture).toHaveBeenCalled();
      const [, props, options] = scopedCapture.mock.calls[0] ?? [];
      expect(props).toBeUndefined();
      expect(options.distinctId).toBeUndefined();
    });
  });

  describe('registerBlock', () => {
    test('registers block with plugin info', () => {
      handler.registerBlock('@test/plugin', {
        id: 'my-block',
        category: 'utility',
      });

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('merges package metadata with block definition', () => {
      const block = {
        id: 'timer',
        category: 'input',
      };
      const packageMetadata = {
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        icon: 'timer-icon',
        homepage: 'https://example.com',
        blocks: [
          {
            id: 'timer',
            name: 'Timer Block',
            description: 'A timer',
          },
        ],
      };

      handler.registerBlock('@test/plugin', block, packageMetadata);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('handles author as object', () => {
      const block = {
        id: 'test',
      };
      const packageMetadata = {
        author: {
          name: 'Object Author',
        },
      };

      handler.registerBlock('@test/plugin', block, packageMetadata);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('handles package metadata without matching block in blocks array', () => {
      const block = {
        id: 'unmatched-block',
      };
      const packageMetadata = {
        version: '1.0.0',
        blocks: [
          {
            id: 'different-block',
          },
        ],
      };

      handler.registerBlock('@test/plugin', block, packageMetadata);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('handles no package metadata', () => {
      const block = {
        id: 'bare-block',
      };

      handler.registerBlock('@test/plugin', block);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
      // Plugin info should have 'unknown' version
      const registeredPluginInfo = mockBlockRegistry.register.mock.calls[0][1];
      expect(registeredPluginInfo.version).toBe('unknown');
    });
  });

  describe('registerSpark', () => {
    test('registers spark with spark registry', () => {
      handler.registerSpark('@test/plugin', {
        id: 'my-spark',
        schema: {
          type: 'object',
        },
      });

      expect(mockSparkRegistry.register.mock.calls.length > 0).toBe(true);
    });
  });

  describe('emitSpark', () => {
    test('dispatches spark event when spark exists', () => {
      mockSparkRegistry.has.mockReturnValue(true);

      handler.emitSpark('@test/plugin', 'my-spark', {
        value: 42,
      });

      expect(mockEventSystem.dispatch.mock.calls.length > 0).toBe(true);
    });

    test('warns and skips when spark not registered', () => {
      mockSparkRegistry.has.mockReturnValue(false);

      handler.emitSpark('@test/plugin', 'unknown-spark', {
        value: 42,
      });

      expect(mockEventSystem.dispatch.mock.calls.length > 0).toBe(false);
    });
  });

  describe('subscribeToSparks', () => {
    test('subscribes to spark events', () => {
      const sparkHandler = mock();
      const unsubscribe = handler.subscribeToSparks('@test/plugin:my-spark', sparkHandler);

      expect(mockEventSystem.subscribe.mock.calls.length > 0).toBe(true);
      expect(typeof unsubscribe).toBe('function');
    });

    test('filters events by spark type', () => {
      let capturedCallback: ((action: unknown) => void) | undefined;
      mockEventSystem.subscribe.mockImplementation(
        (_actionDef: unknown, callback: (action: unknown) => void) => {
          capturedCallback = callback;
          return () => undefined;
        }
      );

      const sparkHandler = mock();
      handler.subscribeToSparks('@test/plugin:my-spark', sparkHandler);

      // Simulate matching event
      if (capturedCallback) {
        capturedCallback({
          payload: {
            type: '@test/plugin:my-spark',
            payload: {
              data: 1,
            },
            source: 'test',
          },
          timestamp: Date.now(),
          id: 'action-1',
        });
        expect(sparkHandler).toHaveBeenCalledTimes(1);

        // Simulate non-matching event
        capturedCallback({
          payload: {
            type: 'other:spark',
            payload: {
              data: 2,
            },
            source: 'test',
          },
          timestamp: Date.now(),
          id: 'action-2',
        });
        expect(sparkHandler).toHaveBeenCalledTimes(1); // Not called again
      }
    });
  });

  describe('registerBrickType', () => {
    test('registers brick type and dispatches event', () => {
      const brickType = {
        id: 'test-brick',
        families: ['sm', 'md'] as Array<'sm' | 'md' | 'lg'>,
      };

      handler.registerBrickType('@test/plugin', brickType);

      expect(mockBrickTypeRegistry.register).toHaveBeenCalled();
      expect(mockEventSystem.dispatch).toHaveBeenCalled();
    });

    test('registers brick type with manifest', () => {
      const brickType = {
        id: 'test-brick',
        families: ['sm', 'md'] as Array<'sm' | 'md' | 'lg'>,
        config: [
          {
            key: 'color',
            type: 'string',
          },
        ],
      };
      const manifest = {
        name: 'Test Brick',
        description: 'A test brick',
        category: 'widgets',
        icon: 'brick-icon',
        color: '#ff0000',
      };

      handler.registerBrickType('@test/plugin', brickType, manifest);

      expect(mockBrickTypeRegistry.register).toHaveBeenCalledWith(
        brickType,
        '@test/plugin',
        manifest,
        undefined
      );
    });

    test('registers brick type without manifest', () => {
      const brickType = {
        id: 'test-brick',
        families: ['lg'] as Array<'sm' | 'md' | 'lg'>,
      };

      handler.registerBrickType('@test/plugin', brickType);

      expect(mockBrickTypeRegistry.register).toHaveBeenCalledWith(
        brickType,
        '@test/plugin',
        undefined,
        undefined
      );
    });
  });

  describe('registerRoute', () => {
    test('registers route with plugin route registry', () => {
      handler.registerRoute('@test/plugin', 'GET', '/api/custom');

      expect(mockPluginRouteRegistry.register).toHaveBeenCalledWith(
        '@test/plugin',
        'GET',
        '/api/custom'
      );
    });

    test('registers multiple routes', () => {
      handler.registerRoute('@test/plugin', 'GET', '/api/items');
      handler.registerRoute('@test/plugin', 'POST', '/api/items');

      expect(mockPluginRouteRegistry.register).toHaveBeenCalledTimes(2);
    });
  });

  describe('onPluginDisconnected', () => {
    test('preserves brick data so the UI keeps showing last values during reload/crash', () => {
      handler.onPluginDisconnected('@test/plugin');

      // Disconnect is transient (hot reload, crash + auto-restart). Clearing
      // here would force every brick into <Loader/> until the new poll lands;
      // brick data lives until the plugin is fully uninstalled instead.
      expect(mockBrickDataStore.removeByPlugin).not.toHaveBeenCalled();
    });
  });

  describe('onPluginRemoved', () => {
    test('clears cached brick data when the plugin is uninstalled', () => {
      handler.onPluginRemoved('@test/plugin');

      expect(mockBrickDataStore.removeByPlugin).toHaveBeenCalledWith('@test/plugin');
    });
  });

  describe('onRssSoftLimitBreached', () => {
    test('dispatches a structured rssSoftLimitBreached event with the breach details', () => {
      const MB = 1024 * 1024;
      handler.onRssSoftLimitBreached('uid-123', '@test/plugin', 600 * MB, 512 * MB);

      expect(mockEventSystem.dispatch).toHaveBeenCalledTimes(1);
      const dispatched = mockEventSystem.dispatch.mock.calls[0][0];
      expect(dispatched.payload).toMatchObject({
        uid: 'uid-123',
        name: '@test/plugin',
        rssBytes: 600 * MB,
        limitBytes: 512 * MB,
      });
    });
  });

  describe('pushBrickData', () => {
    test('dispatches dataUpdated event', () => {
      handler.pushBrickData('@test/plugin', 'my-brick', { temp: 22 });

      expect(mockEventSystem.dispatch).toHaveBeenCalled();
    });
  });
});
