/**
 * Tests for PluginEventHandler
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { SparkRegistry } from '@/runtime/sparks';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({ autoStub: false });

describe('PluginEventHandler', () => {
  let handler: PluginEventHandler;
  let mockBlockRegistry: { register: ReturnType<typeof mock> };
  let mockSparkRegistry: {
    register: ReturnType<typeof mock>;
    has: ReturnType<typeof mock>;
  };
  let mockStateStore: { setHealth: ReturnType<typeof mock> };
  let mockEventSystem: {
    dispatch: ReturnType<typeof mock>;
    subscribe: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockBlockRegistry = { register: mock() };
    mockSparkRegistry = {
      register: mock(),
      has: mock().mockReturnValue(true),
    };
    mockStateStore = { setHealth: mock() };
    mockEventSystem = {
      dispatch: mock(),
      subscribe: mock().mockReturnValue(() => undefined),
    };

    stub(Logger);
    provide(BlockRegistry, mockBlockRegistry);
    provide(SparkRegistry, mockSparkRegistry);
    provide(StateStore, mockStateStore);
    provide(EventSystem, mockEventSystem);

    handler = get(PluginEventHandler);
  });

  describe('block emit handler', () => {
    test('setBlockEmitHandler sets the handler', () => {
      const emitHandler = mock();
      handler.setBlockEmitHandler(emitHandler);

      handler.onBlockEmit('instance-1', 'output', { value: 42 });

      expect(emitHandler.mock.calls.length > 0).toBe(true);
      expect(emitHandler.mock.calls[emitHandler.mock.calls.length - 1]).toEqual([
        'instance-1',
        'output',
        { value: 42 },
      ]);
    });

    test('clearBlockEmitHandler removes the handler', () => {
      const emitHandler = mock();
      handler.setBlockEmitHandler(emitHandler);
      handler.clearBlockEmitHandler();

      handler.onBlockEmit('instance-1', 'output', { value: 42 });

      expect(emitHandler.mock.calls.length > 0).toBe(false);
    });

    test('onBlockEmit does nothing when no handler set', () => {
      // Should not throw
      expect(() => handler.onBlockEmit('instance-1', 'output', {})).not.toThrow();
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
      handler.onPluginLog('@test/plugin', 'info', 'Test log message', { key: 'value' });

      // Logger emit should be called (via the mock)
      // We can verify it doesn't throw
    });

    test('handles log without meta', () => {
      // Should not throw
      expect(() => handler.onPluginLog('@test/plugin', 'warn', 'Warning message')).not.toThrow();
    });
  });

  describe('registerBlock', () => {
    test('registers block with plugin info', () => {
      handler.registerBlock('@test/plugin', { id: 'my-block', category: 'utility' });

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('merges package metadata with block definition', () => {
      const block = { id: 'timer', category: 'input' };
      const packageMetadata = {
        version: '1.0.0',
        description: 'Test plugin',
        author: 'Test Author',
        icon: 'timer-icon',
        homepage: 'https://example.com',
        blocks: [{ id: 'timer', name: 'Timer Block', description: 'A timer' }],
      };

      handler.registerBlock('@test/plugin', block, packageMetadata);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });

    test('handles author as object', () => {
      const block = { id: 'test' };
      const packageMetadata = {
        author: { name: 'Object Author' },
      };

      handler.registerBlock('@test/plugin', block, packageMetadata);

      expect(mockBlockRegistry.register.mock.calls.length > 0).toBe(true);
    });
  });

  describe('registerSpark', () => {
    test('registers spark with spark registry', () => {
      handler.registerSpark('@test/plugin', { id: 'my-spark', schema: { type: 'object' } });

      expect(mockSparkRegistry.register.mock.calls.length > 0).toBe(true);
    });
  });

  describe('emitSpark', () => {
    test('dispatches spark event when spark exists', () => {
      mockSparkRegistry.has.mockReturnValue(true);

      handler.emitSpark('@test/plugin', 'my-spark', { value: 42 });

      expect(mockEventSystem.dispatch.mock.calls.length > 0).toBe(true);
    });

    test('warns and skips when spark not registered', () => {
      mockSparkRegistry.has.mockReturnValue(false);

      handler.emitSpark('@test/plugin', 'unknown-spark', { value: 42 });

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
  });
});
