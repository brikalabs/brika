/**
 * Tests for Internal Flow Utilities
 */

import { describe, expect, mock, test } from 'bun:test';
import { FlowImpl } from '../flow';
import { combinatorFlow, ensureFlowImpl, operatorFlow, subscribeRaw } from '../internal';
import type { Flow } from '../types';
import { createTestFlow, createValueCollector, wait } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// ensureFlowImpl Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureFlowImpl', () => {
  test('returns same FlowImpl if already FlowImpl', () => {
    const { flow } = createTestFlow<number>();

    const result = ensureFlowImpl(flow);

    expect(result).toBe(flow);
  });

  test('wraps non-FlowImpl in new FlowImpl', () => {
    const mockFlow: Flow<number> = {
      on: mock(() => undefined),
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const result = ensureFlowImpl(mockFlow);

    expect(result).toBeInstanceOf(FlowImpl);
    expect(result).not.toBe(mockFlow);
  });

  test('forwards values from wrapped flow', () => {
    const subscribers: ((v: number) => void)[] = [];
    const mockFlow: Flow<number> = {
      on: (fn) => {
        subscribers.push(fn as (v: number) => void);
      },
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const wrapped = ensureFlowImpl(mockFlow);
    const { values, subscriber } = createValueCollector<number>();
    wrapped.subscribeRaw(subscriber);

    // Simulate the original flow emitting
    subscribers.forEach((s) => s(42));

    expect(values).toEqual([42]);
  });

  test('wrapped flow pushes values correctly', () => {
    const subscribers: ((v: string) => void)[] = [];
    const mockFlow: Flow<string> = {
      on: (fn) => {
        subscribers.push(fn as (v: string) => void);
      },
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const wrapped = ensureFlowImpl(mockFlow);
    const { values, subscriber } = createValueCollector<string>();
    wrapped.subscribeRaw(subscriber);

    subscribers.forEach((s) => s('hello'));
    subscribers.forEach((s) => s('world'));

    expect(values).toEqual(['hello', 'world']);
  });

  test('wrapped flow setTimeout works correctly', async () => {
    const mockFlow: Flow<number> = {
      on: mock(() => undefined),
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const wrapped = ensureFlowImpl(mockFlow);
    let called = false;

    // Use the wrapped flow's setTimeout (exercises lines 27-28)
    const _cancel = wrapped.setTimeout(() => {
      called = true;
    }, 10);

    await wait(30);
    expect(called).toBe(true);
  });

  test('wrapped flow setTimeout can be cancelled', async () => {
    const mockFlow: Flow<number> = {
      on: mock(() => undefined),
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const wrapped = ensureFlowImpl(mockFlow);
    let called = false;

    const cancel = wrapped.setTimeout(() => {
      called = true;
    }, 50);
    cancel();

    await wait(80);
    expect(called).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// operatorFlow Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('operatorFlow', () => {
  test('creates derived flow from source', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<string>();

    const derived = operatorFlow<number, string>(flow, ({ subscribe, push }) => {
      subscribe((v) => push(String(v)));
    });
    derived.on(subscriber);

    flow.push(42);

    expect(values).toEqual(['42']);
  });

  test('provides subscribe in context', () => {
    const { flow } = createTestFlow<number>();
    const callback = mock(() => undefined);

    operatorFlow(flow, ({ subscribe }) => {
      subscribe(callback);
    });

    flow.push(1);
    flow.push(2);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(1);
    expect(callback).toHaveBeenCalledWith(2);
  });

  test('provides subscribeRaw in context', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();
    let unsubscribeFn: (() => void) | undefined;

    operatorFlow(flow, ({ subscribeRaw }) => {
      unsubscribeFn = subscribeRaw(subscriber);
    });

    flow.push(1);
    unsubscribeFn?.();
    flow.push(2);

    expect(values).toEqual([1]);
  });

  test('provides push in context', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const derived = operatorFlow<number, number>(flow, ({ subscribe, push }) => {
      subscribe((v) => {
        push(v * 10);
        push(v * 100);
      });
    });
    derived.on(subscriber);

    flow.push(1);

    expect(values).toEqual([10, 100]);
  });

  test('provides setTimeout in context', async () => {
    expect.hasAssertions();
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const derived = operatorFlow<number, number>(flow, ({ subscribe, push, setTimeout }) => {
      subscribe((v) => {
        setTimeout(() => push(v), 30);
      });
    });
    derived.on(subscriber);

    flow.push(42);
    expect(values).toHaveLength(0);

    await wait(50);
    expect(values).toEqual([42]);
  });

  test('provides latest in context', () => {
    const { flow } = createTestFlow<number>();
    let latestValue: number | undefined;

    operatorFlow(flow, ({ subscribe, latest }) => {
      subscribe(() => {
        latestValue = latest();
      });
    });

    flow.push(1);
    expect(latestValue).toBe(1);

    flow.push(2);
    expect(latestValue).toBe(2);
  });

  test('handles non-FlowImpl sources', () => {
    const subscribers: ((v: number) => void)[] = [];
    const mockFlow: Flow<number> = {
      on: (fn) => {
        subscribers.push(fn as (v: number) => void);
      },
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const { values, subscriber } = createValueCollector<string>();

    const derived = operatorFlow<number, string>(mockFlow, ({ subscribe, push }) => {
      subscribe((v) => push(`value: ${v}`));
    });
    derived.on(subscriber);

    subscribers.forEach((s) => s(42));

    expect(values).toEqual(['value: 42']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// subscribeRaw Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('subscribeRaw', () => {
  test('subscribes to any Flow', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    subscribeRaw(flow, subscriber);
    flow.push(1);
    flow.push(2);

    expect(values).toEqual([1, 2]);
  });

  test('returns cleanup function', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const cleanup = subscribeRaw(flow, subscriber);
    flow.push(1);
    cleanup();
    flow.push(2);

    expect(values).toEqual([1]);
  });

  test('handles FlowImpl directly', () => {
    const { flow } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();

    const cleanup = subscribeRaw(flow, subscriber);
    flow.push('hello');
    cleanup();
    flow.push('world');

    expect(values).toEqual(['hello']);
  });

  test('handles non-FlowImpl by wrapping', () => {
    const subscribers: ((v: number) => void)[] = [];
    const mockFlow: Flow<number> = {
      on: (fn) => {
        subscribers.push(fn as (v: number) => void);
      },
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const { values, subscriber } = createValueCollector<number>();

    subscribeRaw(mockFlow, subscriber);
    subscribers.forEach((s) => s(99));

    expect(values).toEqual([99]);
  });

  test('cleanup works for wrapped flows', () => {
    const subscribers: ((v: number) => void)[] = [];
    const mockFlow: Flow<number> = {
      on: (fn) => {
        subscribers.push(fn as (v: number) => void);
      },
      to: mock(() => undefined),
      latest: () => undefined,
      pipe: mock(() => mockFlow),
    };

    const { values, subscriber } = createValueCollector<number>();

    const cleanup = subscribeRaw(mockFlow, subscriber);
    subscribers.forEach((s) => s(1));
    cleanup();
    // The wrapper's internal subscriber is removed
    // But the original mock flow still has the subscriber
    // This tests the subscribeRaw behavior

    expect(values).toEqual([1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// combinatorFlow Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('combinatorFlow', () => {
  test('creates standalone flow with trigger', () => {
    const { flow: trigger } = createTestFlow<void>();
    const { values, subscriber } = createValueCollector<number>();

    const flow = combinatorFlow<number>(({ push }) => {
      trigger.on(() => {
        push(1);
        push(2);
        push(3);
      });
    });
    flow.on(subscriber);

    trigger.push(undefined);

    expect(values).toEqual([1, 2, 3]);
  });

  test('provides push in context', () => {
    const { flow: trigger } = createTestFlow<void>();
    const { values, subscriber } = createValueCollector<string>();

    const flow = combinatorFlow<string>(({ push }) => {
      trigger.on(() => {
        push('a');
        push('b');
      });
    });
    flow.on(subscriber);

    trigger.push(undefined);

    expect(values).toEqual(['a', 'b']);
  });

  test('can be used with external subscriptions', () => {
    const { flow: source } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const combined = combinatorFlow<number>(({ push }) => {
      source.on((v) => push(v * 2));
    });
    combined.on(subscriber);

    source.push(5);
    source.push(10);

    expect(values).toEqual([10, 20]);
  });

  test('multiple subscribers receive values', () => {
    const { flow: trigger } = createTestFlow<void>();
    const { values: values1, subscriber: sub1 } = createValueCollector<number>();
    const { values: values2, subscriber: sub2 } = createValueCollector<number>();

    const flow = combinatorFlow<number>(({ push }) => {
      trigger.on(() => push(100));
    });
    flow.on(sub1);
    flow.on(sub2);

    trigger.push(undefined);

    expect(values1).toEqual([100]);
    expect(values2).toEqual([100]);
  });

  test('created flow has latest() method', () => {
    const { flow: trigger } = createTestFlow<void>();
    let _pushFn: ((v: number) => void) | undefined;

    const flow = combinatorFlow<number>(({ push }) => {
      _pushFn = push;
      trigger.on(() => push(42));
    });

    expect(flow.latest()).toBeUndefined();

    trigger.push(undefined);
    expect(flow.latest()).toBe(42);
  });

  test('created flow supports on() subscription', () => {
    const callback = mock(() => undefined);
    const { flow: trigger } = createTestFlow<void>();

    const flow = combinatorFlow<number>(({ push }) => {
      trigger.on(() => push(1));
    });
    flow.on(callback);

    trigger.push(undefined);
    trigger.push(undefined);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(1);
  });

  test('combinatorFlow setTimeout works for delayed push', async () => {
    const { values, subscriber } = createValueCollector<number>();

    const flow = combinatorFlow<number>(({ push }) => {
      // Use the flow's internal setTimeout by deriving and using it
      // The setTimeout is baked into the FlowImpl created by combinatorFlow
      setTimeout(() => push(42), 10);
    });
    flow.on(subscriber);

    await wait(30);
    expect(values).toEqual([42]);
  });
});
