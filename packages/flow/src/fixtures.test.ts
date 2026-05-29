/**
 * Tests for Flow test fixtures.
 *
 * These helpers are only used by the package's own tests, but they
 * still ship with the source tree and need exercising so coverage is
 * honest about what's reachable.
 */

import { describe, expect, test } from 'bun:test';
import { createMockEmitter, createTestFlow, createValueCollector, wait } from './fixtures';
import { CleanupRegistry, FlowImpl } from './flow';

describe('createTestFlow', () => {
  test('returns a FlowImpl and its CleanupRegistry', () => {
    const { flow, cleanup } = createTestFlow<number>();

    expect(flow).toBeInstanceOf(FlowImpl);
    expect(cleanup).toBeInstanceOf(CleanupRegistry);
    expect(cleanup.count).toBe(0);
  });

  test('FlowImpl pushes to subscribers', () => {
    const { flow } = createTestFlow<string>();
    const received: string[] = [];

    flow.subscribeRaw((v) => received.push(v));
    flow.push('hello');
    flow.push('world');

    expect(received).toEqual(['hello', 'world']);
  });

  test('returned setTimeoutFn schedules and is cancelable', async () => {
    const { flow } = createTestFlow<number>();
    let fired = false;

    const cancel = flow.setTimeout(() => {
      fired = true;
    }, 50);
    cancel();

    await wait(80);
    expect(fired).toBe(false);
  });

  test('returned setTimeoutFn does fire when not cancelled', async () => {
    const { flow } = createTestFlow<number>();
    let fired = false;

    flow.setTimeout(() => {
      fired = true;
    }, 5);

    await wait(30);
    expect(fired).toBe(true);
  });
});

describe('createValueCollector', () => {
  test('collects every value the subscriber receives', () => {
    const { values, subscriber } = createValueCollector<number>();

    subscriber(1);
    subscriber(2);
    subscriber(3);

    expect(values).toEqual([1, 2, 3]);
  });

  test('clear() empties the collected values without losing the reference', () => {
    const { values, subscriber, clear } = createValueCollector<string>();

    subscriber('a');
    subscriber('b');
    expect(values).toEqual(['a', 'b']);

    const sameRef = values;
    clear();

    expect(values).toEqual([]);
    expect(values).toBe(sameRef);
  });

  test('clear() can be invoked on an already-empty collector', () => {
    const { values, clear } = createValueCollector<number>();

    clear();
    expect(values).toEqual([]);
  });

  test('clear() lets the collector keep recording after being reset', () => {
    const { values, subscriber, clear } = createValueCollector<number>();

    subscriber(1);
    clear();
    subscriber(2);
    subscriber(3);

    expect(values).toEqual([2, 3]);
  });
});

describe('createMockEmitter', () => {
  test('emit() records each value once', () => {
    const emitter = createMockEmitter<number>();

    emitter.emit(1);
    emitter.emit(2);
    emitter.emit(3);

    expect(emitter.emitted).toEqual([1, 2, 3]);
  });

  test('emitAll() appends every value from the input array', () => {
    const emitter = createMockEmitter<number>();

    emitter.emitAll([10, 20, 30]);

    expect(emitter.emitted).toEqual([10, 20, 30]);
  });

  test('emitAll() preserves existing values', () => {
    const emitter = createMockEmitter<string>();

    emitter.emit('first');
    emitter.emitAll(['second', 'third']);

    expect(emitter.emitted).toEqual(['first', 'second', 'third']);
  });

  test('emitAll() with an empty array is a no-op', () => {
    const emitter = createMockEmitter<number>();

    emitter.emit(1);
    emitter.emitAll([]);

    expect(emitter.emitted).toEqual([1]);
  });
});

describe('wait', () => {
  test('resolves after the requested delay', async () => {
    const start = Date.now();
    await wait(15);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  test('resolves immediately for 0 ms', async () => {
    const start = Date.now();
    await wait(0);
    // The timer fires on the next tick; we just need the awaited promise to
    // settle quickly without hanging. A generous upper bound keeps the test
    // from flaking on a loaded CI runner while still asserting "fast".
    expect(Date.now() - start).toBeLessThan(50);
  });
});
