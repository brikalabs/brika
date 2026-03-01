/**
 * Tests for Flow Operators
 */

import { describe, expect, mock, test } from 'bun:test';
import {
  buffer,
  debounce,
  delay,
  distinct,
  filter,
  flatMap,
  map,
  sample,
  scan,
  skip,
  switchMap,
  take,
  tap,
  throttle,
} from '../operators';
import { createTestFlow, createValueCollector, wait } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Transform Operators
// ─────────────────────────────────────────────────────────────────────────────

describe('Transform Operators', () => {
  describe('map', () => {
    test('transforms each value', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const doubled = flow.pipe(map((x) => x * 2));
      doubled.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toEqual([2, 4, 6]);
    });

    test.each([
      ['number to string', (x: number) => String(x), [1, 2, 3], ['1', '2', '3']],
      ['multiply by 10', (x: number) => x * 10, [1, 2], [10, 20]],
      [
        'extract property',
        (x: { a: number }) => x.a,
        [
          {
            a: 1,
          },
          {
            a: 2,
          },
        ],
        [1, 2],
      ],
      ['constant transform', () => 'constant', [1, 2, 3], ['constant', 'constant', 'constant']],
    ])('%s', (_desc, fn, input, expected) => {
      const { flow } = createTestFlow<unknown>();
      const { values, subscriber } = createValueCollector<unknown>();

      const mapped = flow.pipe(map(fn as (v: unknown) => unknown));
      mapped.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });

    test('handles null and undefined values', () => {
      const { flow } = createTestFlow<number | null | undefined>();
      const { values, subscriber } = createValueCollector<string>();

      const mapped = flow.pipe(map((x) => String(x)));
      mapped.on(subscriber);

      flow.push(1);
      flow.push(null);
      flow.push(undefined);

      expect(values).toEqual(['1', 'null', 'undefined']);
    });
  });

  describe('filter', () => {
    test('only emits values passing predicate', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const evens = flow.pipe(filter((x) => x % 2 === 0));
      evens.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);

      expect(values).toEqual([2, 4]);
    });

    test('filters out all values if none pass', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const filtered = flow.pipe(filter((x) => x > 100));
      filtered.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toHaveLength(0);
    });

    test('passes all values if all pass', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const filtered = flow.pipe(filter((x) => x > 0));
      filtered.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toEqual([1, 2, 3]);
    });

    test.each([
      ['even numbers', (x: number) => x % 2 === 0, [1, 2, 3, 4, 5], [2, 4]],
      ['positive', (x: number) => x > 0, [-1, 0, 1, 2], [1, 2]],
      ['truthy strings', (x: string) => Boolean(x), ['', 'a', '', 'b'], ['a', 'b']],
    ])('%s', (_desc, fn, input, expected) => {
      const { flow } = createTestFlow<unknown>();
      const { values, subscriber } = createValueCollector<unknown>();

      const filtered = flow.pipe(filter(fn as (v: unknown) => boolean));
      filtered.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });
  });

  describe('tap', () => {
    test('calls side effect without transforming', () => {
      const { flow } = createTestFlow<number>();
      const sideEffects: number[] = [];
      const { values, subscriber } = createValueCollector<number>();

      const tapped = flow.pipe(tap((x) => sideEffects.push(x * 10)));
      tapped.on(subscriber);

      flow.push(1);
      flow.push(2);

      expect(sideEffects).toEqual([10, 20]);
      expect(values).toEqual([1, 2]);
    });

    test('passes value through unchanged', () => {
      const { flow } = createTestFlow<{
        id: number;
      }>();
      const { values, subscriber } = createValueCollector<{
        id: number;
      }>();

      const tapped = flow.pipe(tap(() => undefined));
      tapped.on(subscriber);

      const obj = {
        id: 1,
      };
      flow.push(obj);

      expect(values[0]).toBe(obj);
    });

    test('can be used for logging', () => {
      const { flow } = createTestFlow<string>();
      const logged = mock(() => undefined);

      const tapped = flow.pipe(tap(logged));
      tapped.on(() => undefined);

      flow.push('hello');
      flow.push('world');

      expect(logged).toHaveBeenCalledTimes(2);
      expect(logged).toHaveBeenCalledWith('hello');
      expect(logged).toHaveBeenCalledWith('world');
    });
  });

  describe('scan', () => {
    test('accumulates values with seed', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const summed = flow.pipe(scan((acc, v) => acc + v, 0));
      summed.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toEqual([1, 3, 6]);
    });

    test('emits after each accumulation', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number[]>();

      const collected = flow.pipe(scan((acc, v) => [...acc, v], [] as number[]));
      collected.on(subscriber);

      flow.push(1);
      flow.push(2);

      expect(values).toHaveLength(2);
      expect(values[0]).toEqual([1]);
      expect(values[1]).toEqual([1, 2]);
    });

    test.each([
      ['sum', (acc: number, v: number) => acc + v, 0, [1, 2, 3], [1, 3, 6]],
      ['product', (acc: number, v: number) => acc * v, 1, [2, 3, 4], [2, 6, 24]],
      ['concat', (acc: string, v: string) => acc + v, '', ['a', 'b', 'c'], ['a', 'ab', 'abc']],
      ['count', (acc: number) => acc + 1, 0, ['x', 'y', 'z'], [1, 2, 3]],
    ])('%s', (_desc, fn, seed, input, expected) => {
      const { flow } = createTestFlow<unknown>();
      const { values, subscriber } = createValueCollector<unknown>();

      const scanned = flow.pipe(scan(fn as (acc: unknown, v: unknown) => unknown, seed));
      scanned.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timing Operators
// ─────────────────────────────────────────────────────────────────────────────

describe('Timing Operators', () => {
  describe('debounce', () => {
    test('waits for silence before emitting', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const debounced = flow.pipe(debounce(50));
      debounced.on(subscriber);

      flow.push(1);

      expect(values).toHaveLength(0);
      await wait(70);

      expect(values).toEqual([1]);
    });

    test('resets timer on each value', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const debounced = flow.pipe(debounce(50));
      debounced.on(subscriber);

      flow.push(1);
      await wait(30);
      flow.push(2);
      await wait(30);
      flow.push(3);
      await wait(70);

      expect(values).toEqual([3]);
    });

    test('only emits last value in rapid sequence', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const debounced = flow.pipe(debounce(30));
      debounced.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);
      flow.push(5);

      await wait(50);

      expect(values).toEqual([5]);
    });

    test('emits separate values when spaced out', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const debounced = flow.pipe(debounce(30));
      debounced.on(subscriber);

      flow.push(1);
      await wait(50);
      flow.push(2);
      await wait(50);

      expect(values).toEqual([1, 2]);
    });
  });

  describe('throttle', () => {
    test('emits first value immediately', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const throttled = flow.pipe(throttle(100));
      throttled.on(subscriber);

      flow.push(1);

      expect(values).toEqual([1]);
    });

    test('ignores values within throttle window', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const throttled = flow.pipe(throttle(100));
      throttled.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      expect(values).toEqual([1]);
    });

    test('allows value after window expires', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const throttled = flow.pipe(throttle(30));
      throttled.on(subscriber);

      flow.push(1);
      await wait(50);
      flow.push(2);

      expect(values).toEqual([1, 2]);
    });

    test('throttles multiple bursts correctly', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const throttled = flow.pipe(throttle(30));
      throttled.on(subscriber);

      // First burst
      flow.push(1);
      flow.push(2);
      flow.push(3);

      await wait(50);

      // Second burst
      flow.push(4);
      flow.push(5);
      flow.push(6);

      expect(values).toEqual([1, 4]);
    });
  });

  describe('delay', () => {
    test('delays each value by specified ms', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const delayed = flow.pipe(delay(30));
      delayed.on(subscriber);

      flow.push(1);
      expect(values).toHaveLength(0);

      await wait(50);
      expect(values).toEqual([1]);
    });

    test('preserves order', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const delayed = flow.pipe(delay(20));
      delayed.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);

      await wait(50);

      expect(values).toEqual([1, 2, 3]);
    });

    test('each value delayed independently', async () => {
      expect.hasAssertions();
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const delayed = flow.pipe(delay(50));
      delayed.on(subscriber);

      flow.push(1);
      await wait(30);
      flow.push(2);

      // At this point, neither should have emitted
      expect(values).toHaveLength(0);

      await wait(30);
      // First should have emitted
      expect(values).toEqual([1]);

      await wait(30);
      // Both should have emitted
      expect(values).toEqual([1, 2]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Control Operators
// ─────────────────────────────────────────────────────────────────────────────

describe('Control Operators', () => {
  describe('take', () => {
    test('takes first N values', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const taken = flow.pipe(take(2));
      taken.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);

      expect(values).toEqual([1, 2]);
    });

    test('stops after N values', () => {
      const { flow } = createTestFlow<number>();
      const callback = mock(() => undefined);

      const taken = flow.pipe(take(2));
      taken.on(callback);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    test.each([
      [1, [1, 2, 3], [1]],
      [2, [1, 2, 3], [1, 2]],
      [3, [1, 2, 3], [1, 2, 3]],
      [5, [1, 2], [1, 2]], // More than available
      [0, [1, 2, 3], []], // Zero
    ])('take(%i) from %j = %j', (n, input, expected) => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const taken = flow.pipe(take(n));
      taken.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });
  });

  describe('skip', () => {
    test('skips first N values', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const skipped = flow.pipe(skip(2));
      skipped.on(subscriber);

      flow.push(1);
      flow.push(2);
      flow.push(3);
      flow.push(4);

      expect(values).toEqual([3, 4]);
    });

    test('emits remaining values', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const skipped = flow.pipe(skip(1));
      skipped.on(subscriber);

      flow.push(1);
      flow.push(2);

      expect(values).toEqual([2]);
    });

    test.each([
      [1, [1, 2, 3], [2, 3]],
      [2, [1, 2, 3], [3]],
      [3, [1, 2, 3], []],
      [5, [1, 2], []], // Skip more than available
      [0, [1, 2], [1, 2]], // Skip none
    ])('skip(%i) from %j = %j', (n, input, expected) => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const skipped = flow.pipe(skip(n));
      skipped.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });
  });

  describe('distinct', () => {
    test('emits only when value changes', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const distincted = flow.pipe(distinct());
      distincted.on(subscriber);

      flow.push(1);
      flow.push(1);
      flow.push(2);
      flow.push(2);
      flow.push(1);

      expect(values).toEqual([1, 2, 1]);
    });

    test('emits first value', () => {
      const { flow } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      const distincted = flow.pipe(distinct());
      distincted.on(subscriber);

      flow.push(42);

      expect(values).toEqual([42]);
    });

    test.each([
      [
        [1, 1, 2, 2, 1],
        [1, 2, 1],
      ],
      [
        ['a', 'a', 'b'],
        ['a', 'b'],
      ],
      [
        [1, 2, 3],
        [1, 2, 3],
      ], // All distinct
      [[1, 1, 1], [1]], // All same
      [[], []], // Empty
    ])('%j becomes %j', (input, expected) => {
      const { flow } = createTestFlow<unknown>();
      const { values, subscriber } = createValueCollector<unknown>();

      const distincted = flow.pipe(distinct());
      distincted.on(subscriber);

      for (const v of input) {
        flow.push(v);
      }

      expect(values).toEqual(expected);
    });

    test('uses strict equality', () => {
      const { flow } = createTestFlow<{
        id: number;
      }>();
      const { values, subscriber } = createValueCollector<{
        id: number;
      }>();

      const distincted = flow.pipe(distinct());
      distincted.on(subscriber);

      const obj1 = {
        id: 1,
      };
      const obj2 = {
        id: 1,
      };

      flow.push(obj1);
      flow.push(obj1); // Same reference
      flow.push(obj2); // Different reference, same value

      expect(values).toHaveLength(2);
      expect(values[0]).toBe(obj1);
      expect(values[1]).toBe(obj2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Operators
// ─────────────────────────────────────────────────────────────────────────────

describe('Advanced Operators', () => {
  describe('buffer', () => {
    test('collects values until trigger', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number[]>();

      const buffered = source.pipe(buffer(trigger));
      buffered.on(subscriber);

      source.push(1);
      source.push(2);
      source.push(3);

      expect(values).toHaveLength(0);

      trigger.push(undefined);

      expect(values).toEqual([[1, 2, 3]]);
    });

    test('emits buffer as array on trigger', () => {
      const { flow: source } = createTestFlow<string>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<string[]>();

      const buffered = source.pipe(buffer(trigger));
      buffered.on(subscriber);

      source.push('a');
      source.push('b');
      trigger.push(undefined);

      expect(values[0]).toBeInstanceOf(Array);
      expect(values[0]).toEqual(['a', 'b']);
    });

    test('does not emit empty buffer', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number[]>();

      const buffered = source.pipe(buffer(trigger));
      buffered.on(subscriber);

      trigger.push(undefined);
      trigger.push(undefined);

      expect(values).toHaveLength(0);
    });

    test('resets buffer after emit', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number[]>();

      const buffered = source.pipe(buffer(trigger));
      buffered.on(subscriber);

      source.push(1);
      trigger.push(undefined);
      source.push(2);
      source.push(3);
      trigger.push(undefined);

      expect(values).toEqual([[1], [2, 3]]);
    });
  });

  describe('sample', () => {
    test('emits latest value when trigger fires', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number>();

      const sampled = source.pipe(sample(trigger));
      sampled.on(subscriber);

      source.push(1);
      source.push(2);
      source.push(3);
      trigger.push(undefined);

      expect(values).toEqual([3]);
    });

    test('does not emit if no value received', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number>();

      const sampled = source.pipe(sample(trigger));
      sampled.on(subscriber);

      trigger.push(undefined);

      expect(values).toHaveLength(0);
    });

    test('emits same value multiple times if not updated', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number>();

      const sampled = source.pipe(sample(trigger));
      sampled.on(subscriber);

      source.push(42);
      trigger.push(undefined);
      trigger.push(undefined);
      trigger.push(undefined);

      expect(values).toEqual([42, 42, 42]);
    });

    test('reflects latest value at trigger time', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: trigger } = createTestFlow<void>();
      const { values, subscriber } = createValueCollector<number>();

      const sampled = source.pipe(sample(trigger));
      sampled.on(subscriber);

      source.push(1);
      trigger.push(undefined);
      source.push(2);
      source.push(3);
      trigger.push(undefined);

      expect(values).toEqual([1, 3]);
    });
  });

  describe('switchMap', () => {
    test('switches to new inner flow on each value', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: inner1 } = createTestFlow<string>();
      const { flow: inner2 } = createTestFlow<string>();
      const { values, subscriber } = createValueCollector<string>();

      const innerFlows = [inner1, inner2];
      const switched = source.pipe(
        switchMap((n) => {
          const flow = innerFlows[n];
          if (!flow) {
            throw new Error(`Expected inner flow at index ${n}`);
          }
          return flow;
        })
      );
      switched.on(subscriber);

      source.push(0); // Switch to inner1
      inner1.push('a');
      inner1.push('b');

      source.push(1); // Switch to inner2
      inner2.push('x');
      inner1.push('c'); // Should be ignored

      expect(values).toEqual(['a', 'b', 'x']);
    });

    test('unsubscribes from previous inner flow', () => {
      const { flow: source } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<string>();

      const inners: ReturnType<typeof createTestFlow<string>>[] = [];
      const switched = source.pipe(
        switchMap((n) => {
          const inner = createTestFlow<string>();
          inners[n] = inner;
          return inner.flow;
        })
      );
      switched.on(subscriber);

      source.push(0);
      inners[0]?.flow.push('from-0');

      source.push(1);
      inners[0]?.flow.push('ignored'); // Should be ignored
      inners[1]?.flow.push('from-1');

      expect(values).toEqual(['from-0', 'from-1']);
    });

    test('emits values from current inner flow', () => {
      const { flow: source } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      // Store inner flows so we can push after subscription
      const inners: ReturnType<typeof createTestFlow<number>>[] = [];
      const switched = source.pipe(
        switchMap((n) => {
          const inner = createTestFlow<number>();
          inners.push(inner);
          return inner.flow;
        })
      );
      switched.on(subscriber);

      source.push(1);
      inners[0]?.flow.push(10);
      inners[0]?.flow.push(11);

      source.push(2);
      inners[1]?.flow.push(20);
      inners[1]?.flow.push(21);

      expect(values).toEqual([10, 11, 20, 21]);
    });
  });

  describe('flatMap', () => {
    test('flattens nested flows', () => {
      const { flow: source } = createTestFlow<number>();
      const { flow: inner1 } = createTestFlow<string>();
      const { flow: inner2 } = createTestFlow<string>();
      const { values, subscriber } = createValueCollector<string>();

      const innerFlows = [inner1, inner2];
      const flatMapped = source.pipe(
        flatMap((n) => {
          const flow = innerFlows[n];
          if (!flow) {
            throw new Error(`Expected inner flow at index ${n}`);
          }
          return flow;
        })
      );
      flatMapped.on(subscriber);

      source.push(0);
      source.push(1);
      inner1.push('a');
      inner2.push('x');
      inner1.push('b');

      expect(values).toEqual(['a', 'x', 'b']);
    });

    test('maintains all inner subscriptions', () => {
      const { flow: source } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<string>();

      const inners: ReturnType<typeof createTestFlow<string>>[] = [];
      const flatMapped = source.pipe(
        flatMap((n) => {
          const inner = createTestFlow<string>();
          inners[n] = inner;
          return inner.flow;
        })
      );
      flatMapped.on(subscriber);

      source.push(0);
      source.push(1);

      inners[0]?.flow.push('from-0');
      inners[1]?.flow.push('from-1');
      inners[0]?.flow.push('still-from-0');

      expect(values).toEqual(['from-0', 'from-1', 'still-from-0']);
    });

    test('emits from all inner flows', () => {
      const { flow: source } = createTestFlow<number>();
      const { values, subscriber } = createValueCollector<number>();

      // Store inner flows so we can push after subscription
      const inners: ReturnType<typeof createTestFlow<number>>[] = [];
      const flatMapped = source.pipe(
        flatMap((n) => {
          const inner = createTestFlow<number>();
          inners.push(inner);
          return inner.flow;
        })
      );
      flatMapped.on(subscriber);

      source.push(1);
      source.push(2);
      source.push(3);

      inners[0]?.flow.push(100);
      inners[1]?.flow.push(200);
      inners[2]?.flow.push(300);

      expect(values).toEqual([100, 200, 300]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Operator Chaining Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Operator Chaining', () => {
  test('chains multiple operators correctly', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const result = flow.pipe(
      filter((x) => x > 0),
      map((x) => x * 2),
      take(3)
    );
    result.on(subscriber);

    flow.push(-1);
    flow.push(1);
    flow.push(2);
    flow.push(3);
    flow.push(4);

    expect(values).toEqual([2, 4, 6]);
  });

  test('complex chain with scan and distinct', () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const result = flow.pipe(
      scan((acc, v) => acc + v, 0),
      distinct()
    );
    result.on(subscriber);

    flow.push(1);
    flow.push(0); // Sum still 1
    flow.push(1); // Sum now 2

    expect(values).toEqual([1, 2]);
  });
});
