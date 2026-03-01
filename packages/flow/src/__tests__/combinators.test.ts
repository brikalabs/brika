/**
 * Tests for Flow Combinators
 */

import { describe, expect, test } from 'bun:test';
import { all, combine, merge, race, zip } from '../combinators';
import { createTestFlow, createValueCollector } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// combine Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('combine', () => {
  test('emits tuple when any flow emits', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const combined = combine(a, b);
    combined.on(subscriber);

    a.push(1);
    b.push('x');
    a.push(2);

    expect(values).toEqual([
      [1, 'x'],
      [2, 'x'],
    ]);
  });

  test('uses latest value from each flow', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<[number, number]>();

    const combined = combine(a, b);
    combined.on(subscriber);

    a.push(1);
    a.push(2);
    a.push(3);
    b.push(10);

    expect(values).toEqual([[3, 10]]);
  });

  test('waits for all flows to have value before first emit', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const combined = combine(a, b);
    combined.on(subscriber);

    a.push(1);
    expect(values).toHaveLength(0);

    b.push('x');
    expect(values).toHaveLength(1);
  });

  test('handles 2 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const combined = combine(a, b);
    combined.on(subscriber);

    a.push(1);
    b.push('a');

    expect(values).toEqual([[1, 'a']]);
  });

  test('handles 3 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<boolean>();
    const { values, subscriber } = createValueCollector<[number, string, boolean]>();

    const combined = combine(a, b, c);
    combined.on(subscriber);

    a.push(1);
    b.push('a');
    c.push(true);

    expect(values).toEqual([[1, 'a', true]]);
  });

  test('handles 4 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<boolean>();
    const { flow: d } = createTestFlow<null>();
    const { values, subscriber } = createValueCollector<[number, string, boolean, null]>();

    const combined = combine(a, b, c, d);
    combined.on(subscriber);

    a.push(1);
    b.push('a');
    c.push(true);
    d.push(null);

    expect(values).toEqual([[1, 'a', true, null]]);
  });

  test('emits new tuple on each subsequent emission', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<[number, number]>();

    const combined = combine(a, b);
    combined.on(subscriber);

    a.push(1);
    b.push(10);
    a.push(2);
    b.push(20);
    a.push(3);

    expect(values).toEqual([
      [1, 10],
      [2, 10],
      [2, 20],
      [3, 20],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zip Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('zip', () => {
  test('waits for all flows to emit before emitting tuple', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const zipped = zip(a, b);
    zipped.on(subscriber);

    a.push(1);
    expect(values).toHaveLength(0);

    b.push('x');
    expect(values).toEqual([[1, 'x']]);
  });

  test('pairs values in order', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const zipped = zip(a, b);
    zipped.on(subscriber);

    a.push(1);
    a.push(2);
    b.push('x');
    b.push('y');

    expect(values).toEqual([
      [1, 'x'],
      [2, 'y'],
    ]);
  });

  test('buffers values until all flows have emitted', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const zipped = zip(a, b);
    zipped.on(subscriber);

    a.push(1);
    a.push(2);
    a.push(3);
    expect(values).toHaveLength(0);

    b.push('x');
    expect(values).toEqual([[1, 'x']]);

    b.push('y');
    expect(values).toEqual([
      [1, 'x'],
      [2, 'y'],
    ]);
  });

  test('handles uneven emission rates', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const zipped = zip(a, b);
    zipped.on(subscriber);

    a.push(1);
    a.push(2);
    a.push(3);
    a.push(4);
    a.push(5);
    b.push('a');
    b.push('b');

    expect(values).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  test('handles 3 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<boolean>();
    const { values, subscriber } = createValueCollector<[number, string, boolean]>();

    const zipped = zip(a, b, c);
    zipped.on(subscriber);

    a.push(1);
    b.push('x');
    c.push(true);
    a.push(2);
    b.push('y');
    c.push(false);

    expect(values).toEqual([
      [1, 'x', true],
      [2, 'y', false],
    ]);
  });

  test('consumes buffered values in FIFO order', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const zipped = zip(a, b);
    zipped.on(subscriber);

    b.push('first');
    b.push('second');
    b.push('third');

    a.push(1);
    a.push(2);

    expect(values).toEqual([
      [1, 'first'],
      [2, 'second'],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// merge Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('merge', () => {
  test('merges multiple flows into one', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const merged = merge(a, b);
    merged.on(subscriber);

    a.push(1);
    b.push(2);
    a.push(3);

    expect(values).toEqual([1, 2, 3]);
  });

  test('emits values from any source', () => {
    const { flow: a } = createTestFlow<string>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();

    const merged = merge(a, b, c);
    merged.on(subscriber);

    c.push('from-c');
    a.push('from-a');
    b.push('from-b');

    expect(values).toContain('from-a');
    expect(values).toContain('from-b');
    expect(values).toContain('from-c');
  });

  test('preserves emission order', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const merged = merge(a, b);
    merged.on(subscriber);

    a.push(1);
    a.push(2);
    b.push(10);
    a.push(3);
    b.push(20);

    expect(values).toEqual([1, 2, 10, 3, 20]);
  });

  test('handles single flow', () => {
    const { flow: a } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const merged = merge(a);
    merged.on(subscriber);

    a.push(1);
    a.push(2);

    expect(values).toEqual([1, 2]);
  });

  test('handles many flows', () => {
    const flows = Array.from(
      {
        length: 5,
      },
      () => createTestFlow<number>()
    );
    const { values, subscriber } = createValueCollector<number>();

    const merged = merge(...flows.map((f) => f.flow));
    merged.on(subscriber);

    flows.forEach((f, i) => f.flow.push(i));

    expect(values).toEqual([0, 1, 2, 3, 4]);
  });

  test('does not emit before any flow emits', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const merged = merge(a, b);
    merged.on(subscriber);

    expect(values).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// race Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('race', () => {
  test('emits from first flow to emit', () => {
    const { flow: a } = createTestFlow<string>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();

    const raced = race(a, b);
    raced.on(subscriber);

    b.push('winner');

    expect(values).toEqual(['winner']);
  });

  test('ignores subsequent emissions from all flows', () => {
    const { flow: a } = createTestFlow<string>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();

    const raced = race(a, b);
    raced.on(subscriber);

    a.push('first');
    a.push('second');
    b.push('from-b');

    expect(values).toEqual(['first']);
  });

  test('only emits once', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { flow: c } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const raced = race(a, b, c);
    raced.on(subscriber);

    b.push(1);
    a.push(2);
    c.push(3);
    b.push(4);

    expect(values).toHaveLength(1);
    expect(values[0]).toBe(1);
  });

  test('handles single flow', () => {
    const { flow: a } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();

    const raced = race(a);
    raced.on(subscriber);

    a.push(42);
    a.push(43);

    expect(values).toEqual([42]);
  });

  test('first emit from any flow wins', () => {
    const { flow: a } = createTestFlow<string>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();

    const raced = race(a, b, c);
    raced.on(subscriber);

    c.push('c-wins');

    expect(values).toEqual(['c-wins']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// all Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('all', () => {
  test('waits for all flows to emit at least once', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const alled = all(a, b);
    alled.on(subscriber);

    a.push(1);
    expect(values).toHaveLength(0);

    b.push('x');
    expect(values).toEqual([[1, 'x']]);
  });

  test('emits tuple of all values', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<boolean>();
    const { values, subscriber } = createValueCollector<[number, string, boolean]>();

    const alled = all(a, b, c);
    alled.on(subscriber);

    a.push(42);
    b.push('hello');
    c.push(true);

    expect(values).toEqual([[42, 'hello', true]]);
  });

  test('only emits once', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<[number, number]>();

    const alled = all(a, b);
    alled.on(subscriber);

    a.push(1);
    b.push(2);
    a.push(3);
    b.push(4);
    a.push(5);

    expect(values).toHaveLength(1);
    expect(values[0]).toEqual([1, 2]);
  });

  test('uses latest values at time of completion', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[number, string]>();

    const alled = all(a, b);
    alled.on(subscriber);

    a.push(1);
    a.push(2);
    a.push(3);
    b.push('final');

    expect(values).toEqual([[3, 'final']]);
  });

  test('handles 2 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<[number, number]>();

    const alled = all(a, b);
    alled.on(subscriber);

    a.push(1);
    b.push(2);

    expect(values).toEqual([[1, 2]]);
  });

  test('handles 3 flows', () => {
    const { flow: a } = createTestFlow<number>();
    const { flow: b } = createTestFlow<number>();
    const { flow: c } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<[number, number, number]>();

    const alled = all(a, b, c);
    alled.on(subscriber);

    c.push(3);
    a.push(1);
    b.push(2);

    expect(values).toEqual([[1, 2, 3]]);
  });

  test('order of emissions does not matter', () => {
    const { flow: a } = createTestFlow<string>();
    const { flow: b } = createTestFlow<string>();
    const { flow: c } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<[string, string, string]>();

    const alled = all(a, b, c);
    alled.on(subscriber);

    c.push('c');
    b.push('b');
    a.push('a');

    expect(values).toEqual([['a', 'b', 'c']]);
  });
});
