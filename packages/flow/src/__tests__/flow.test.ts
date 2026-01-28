/**
 * Tests for FlowImpl and CleanupRegistry
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CleanupRegistry, createFlow, FlowImpl } from '../flow';
import { filter, map } from '../operators';
import { createMockEmitter, createTestFlow, createValueCollector } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// CleanupRegistry Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CleanupRegistry', () => {
  describe('register', () => {
    test('adds cleanup function to registry', () => {
      const registry = new CleanupRegistry();
      const cleanup = mock(() => undefined);

      registry.register(cleanup);

      expect(registry.count).toBe(1);
    });

    test('tracks count correctly with multiple registrations', () => {
      const registry = new CleanupRegistry();

      registry.register(() => undefined);
      registry.register(() => undefined);
      registry.register(() => undefined);

      expect(registry.count).toBe(3);
    });
  });

  describe('cleanup', () => {
    test('calls all registered cleanup functions', () => {
      const registry = new CleanupRegistry();
      const cleanup1 = mock(() => undefined);
      const cleanup2 = mock(() => undefined);
      const cleanup3 = mock(() => undefined);

      registry.register(cleanup1);
      registry.register(cleanup2);
      registry.register(cleanup3);
      registry.cleanup();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    test('clears registry after cleanup', () => {
      const registry = new CleanupRegistry();
      registry.register(() => undefined);
      registry.register(() => undefined);

      registry.cleanup();

      expect(registry.count).toBe(0);
    });

    test('ignores errors in cleanup functions', () => {
      const registry = new CleanupRegistry();
      const errorCleanup = mock(() => {
        throw new Error('Cleanup error');
      });
      const goodCleanup = mock(() => undefined);

      registry.register(errorCleanup);
      registry.register(goodCleanup);

      expect(() => registry.cleanup()).not.toThrow();
      expect(errorCleanup).toHaveBeenCalledTimes(1);
      expect(goodCleanup).toHaveBeenCalledTimes(1);
    });

    test('handles empty registry', () => {
      const registry = new CleanupRegistry();

      expect(() => registry.cleanup()).not.toThrow();
      expect(registry.count).toBe(0);
    });
  });

  describe('count', () => {
    test('returns number of registered cleanups', () => {
      const registry = new CleanupRegistry();

      expect(registry.count).toBe(0);

      registry.register(() => undefined);
      expect(registry.count).toBe(1);

      registry.register(() => undefined);
      expect(registry.count).toBe(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FlowImpl Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FlowImpl', () => {
  let flow: FlowImpl<number>;
  let cleanup: CleanupRegistry;

  beforeEach(() => {
    const result = createTestFlow<number>();
    flow = result.flow;
    cleanup = result.cleanup;
  });

  describe('push', () => {
    test('notifies all subscribers', () => {
      const { values: values1, subscriber: sub1 } = createValueCollector<number>();
      const { values: values2, subscriber: sub2 } = createValueCollector<number>();

      flow.subscribe(sub1);
      flow.subscribe(sub2);
      flow.push(42);

      expect(values1).toEqual([42]);
      expect(values2).toEqual([42]);
    });

    test('updates latest value', () => {
      flow.push(1);
      expect(flow.latest()).toBe(1);

      flow.push(2);
      expect(flow.latest()).toBe(2);
    });

    test('handles no subscribers', () => {
      expect(() => flow.push(42)).not.toThrow();
      expect(flow.latest()).toBe(42);
    });

    test('notifies subscribers in order of registration', () => {
      const order: number[] = [];
      flow.subscribe(() => {
        order.push(1);
      });
      flow.subscribe(() => {
        order.push(2);
      });
      flow.subscribe(() => {
        order.push(3);
      });

      flow.push(42);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('subscribe', () => {
    test('registers subscriber with auto-cleanup', () => {
      const { values, subscriber } = createValueCollector<number>();

      flow.subscribe(subscriber);
      flow.push(1);

      expect(values).toEqual([1]);
      expect(cleanup.count).toBe(1);
    });

    test('receives pushed values', () => {
      const { values, subscriber } = createValueCollector<number>();

      flow.subscribe(subscriber);
      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toEqual([1, 2, 3]);
    });

    test('auto-cleanup removes subscriber on cleanup', () => {
      const { values, subscriber } = createValueCollector<number>();

      flow.subscribe(subscriber);
      flow.push(1);
      cleanup.cleanup();
      flow.push(2);

      expect(values).toEqual([1]);
    });
  });

  describe('subscribeRaw', () => {
    test('registers subscriber without auto-cleanup', () => {
      const { values, subscriber } = createValueCollector<number>();

      flow.subscribeRaw(subscriber);
      flow.push(1);

      expect(values).toEqual([1]);
      expect(cleanup.count).toBe(0);
    });

    test('returns unsubscribe function', () => {
      const { values, subscriber } = createValueCollector<number>();

      const unsubscribe = flow.subscribeRaw(subscriber);
      flow.push(1);
      unsubscribe();
      flow.push(2);

      expect(values).toEqual([1]);
    });

    test('unsubscribe removes only that subscriber', () => {
      const { values: values1, subscriber: sub1 } = createValueCollector<number>();
      const { values: values2, subscriber: sub2 } = createValueCollector<number>();

      const unsub1 = flow.subscribeRaw(sub1);
      flow.subscribeRaw(sub2);

      flow.push(1);
      unsub1();
      flow.push(2);

      expect(values1).toEqual([1]);
      expect(values2).toEqual([1, 2]);
    });
  });

  describe('clear', () => {
    test('removes all subscribers', () => {
      const { values: values1, subscriber: sub1 } = createValueCollector<number>();
      const { values: values2, subscriber: sub2 } = createValueCollector<number>();

      flow.subscribe(sub1);
      flow.subscribe(sub2);
      flow.push(1);
      flow.clear();
      flow.push(2);

      expect(values1).toEqual([1]);
      expect(values2).toEqual([1]);
    });
  });

  describe('on', () => {
    test('is alias for subscribe', () => {
      const { values, subscriber } = createValueCollector<number>();

      flow.on(subscriber);
      flow.push(42);

      expect(values).toEqual([42]);
      expect(cleanup.count).toBe(1);
    });
  });

  describe('to', () => {
    test('routes values to emitter', () => {
      const emitter = createMockEmitter<number>();

      flow.to(emitter);
      flow.push(1);
      flow.push(2);

      expect(emitter.emitted).toEqual([1, 2]);
    });

    test('routes to multiple emitters', () => {
      const emitter1 = createMockEmitter<number>();
      const emitter2 = createMockEmitter<number>();

      flow.to(emitter1, emitter2);
      flow.push(42);

      expect(emitter1.emitted).toEqual([42]);
      expect(emitter2.emitted).toEqual([42]);
    });
  });

  describe('latest', () => {
    test('returns undefined before any push', () => {
      expect(flow.latest()).toBeUndefined();
    });

    test('returns last pushed value', () => {
      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(flow.latest()).toBe(3);
    });
  });

  describe('pipe', () => {
    test('chains single operator', () => {
      const { values, subscriber } = createValueCollector<number>();

      const doubled = flow.pipe(map((x) => x * 2));
      doubled.on(subscriber);

      flow.push(5);

      expect(values).toEqual([10]);
    });

    test('chains multiple operators', () => {
      const { values, subscriber } = createValueCollector<number>();

      const result = flow.pipe(
        filter((x) => x > 2),
        map((x) => x * 10)
      );
      result.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);

      expect(values).toEqual([30, 40]);
    });

    test('preserves type through chain', () => {
      const stringFlow = flow.pipe(
        map((x) => x.toString()),
        map((s) => s + '!')
      );

      const { values, subscriber } = createValueCollector<string>();
      stringFlow.on(subscriber);

      flow.push(42);

      expect(values).toEqual(['42!']);
    });
  });

  describe('derive', () => {
    test('creates new flow with shared context', () => {
      const derived = flow.derive<string>();

      const { values, subscriber } = createValueCollector<string>();
      derived.on(subscriber);
      derived.push('hello');

      expect(values).toEqual(['hello']);
    });

    test('derived flow shares cleanup registry', () => {
      const derived = flow.derive<string>();
      derived.on(() => undefined);

      // Both registrations should be tracked
      expect(cleanup.count).toBe(1);
    });
  });

  describe('setTimeout', () => {
    test('schedules callback with cleanup', async () => {
      expect.hasAssertions();
      const callback = mock(() => undefined);

      flow.setTimeout(callback, 10);

      expect(callback).not.toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 20));
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('returns cleanup function that cancels timeout', async () => {
      expect.hasAssertions();
      const callback = mock(() => undefined);

      const cancel = flow.setTimeout(callback, 50);
      cancel();

      await new Promise((r) => setTimeout(r, 100));
      expect(callback).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createFlow Factory Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createFlow', () => {
  test('creates FlowImpl with provided dependencies', () => {
    const cleanup = new CleanupRegistry();
    const setTimeoutFn = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    };

    const flow = createFlow<number>(setTimeoutFn, cleanup);

    expect(flow).toBeInstanceOf(FlowImpl);
  });

  test('created flow is functional', () => {
    const cleanup = new CleanupRegistry();
    const setTimeoutFn = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    };

    const flow = createFlow<string>(setTimeoutFn, cleanup);
    const { values, subscriber } = createValueCollector<string>();

    flow.subscribe(subscriber);
    flow.push('test');

    expect(values).toEqual(['test']);
  });
});
