/**
 * Tests for Flow Sources
 */

import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { interval, isSource, timer } from './sources';

// ─────────────────────────────────────────────────────────────────────────────
// isSource Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isSource', () => {
  test.each([
    [
      'valid source with start function',
      {
        __source: true,
        start: () => () => undefined,
      },
      true,
    ],
    [
      'missing __source property',
      {
        start: () => () => undefined,
      },
      false,
    ],
    [
      '__source is false',
      {
        __source: false,
        start: () => () => undefined,
      },
      false,
    ],
    ['null value', null, false],
    ['undefined value', undefined, false],
    ['string value', 'source', false],
    ['number value', 123, false],
    ['empty object', {}, false],
    ['array', [], false],
    ['function', () => undefined, false],
    [
      'object with only __source',
      {
        __source: true,
      },
      true,
    ],
  ])('returns correct result for %s', (_description, value, expected) => {
    expect(isSource(value)).toBe(expected);
  });

  test('correctly identifies interval source', () => {
    const source = interval(100);
    expect(isSource(source)).toBeTrue();
  });

  test('correctly identifies timer source', () => {
    const source = timer(100);
    expect(isSource(source)).toBeTrue();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interval Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('interval', () => {
  // Fake timers make the cadence deterministic: a real setInterval under heavy
  // parallel CPU load fires fewer times than its nominal rate (it does not
  // replay missed ticks), which used to flake the emission-count assertions.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('creates source with __source marker', () => {
    const source = interval(100);

    expect(source.__source).toBeTrue();
    expect(typeof source.start).toBe('function');
  });

  test('emits incrementing numbers starting at 0', () => {
    const source = interval(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    jest.advanceTimersByTime(70); // ticks at 20/40/60ms
    cleanup();

    expect(values).toEqual([0, 1, 2]);
  });

  test('emits at specified interval', () => {
    const source = interval(30);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    expect(values).toEqual([]); // nothing before the first tick
    jest.advanceTimersByTime(29);
    expect(values).toEqual([]); // not yet at 30ms
    jest.advanceTimersByTime(1);
    expect(values).toEqual([0]); // first emission exactly at 30ms
    jest.advanceTimersByTime(60);
    expect(values).toEqual([0, 1, 2]); // further ticks at 60/90ms

    cleanup();
  });

  test('cleanup stops interval', () => {
    const source = interval(10);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    jest.advanceTimersByTime(35); // ticks at 10/20/30ms
    cleanup();
    jest.advanceTimersByTime(50);

    expect(values).toEqual([0, 1, 2]);
  });

  test('multiple starts create independent intervals', () => {
    const source = interval(20);
    const values1: number[] = [];
    const values2: number[] = [];

    const cleanup1 = source.start((v) => values1.push(v));
    const cleanup2 = source.start((v) => values2.push(v));
    jest.advanceTimersByTime(50); // ticks at 20/40ms
    cleanup1();
    cleanup2();

    // Both emitted independently and identically.
    expect(values1).toEqual([0, 1]);
    expect(values2).toEqual([0, 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// timer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('timer', () => {
  // Same wall-clock flakiness class as `interval`: drive the one-shot delay
  // deterministically instead of racing real setTimeout against real waits.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('creates source with __source marker', () => {
    const source = timer(100);

    expect(source.__source).toBeTrue();
    expect(typeof source.start).toBe('function');
  });

  test('emits 0 after specified delay', () => {
    const source = timer(30);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    expect(values).toHaveLength(0);
    jest.advanceTimersByTime(29);
    expect(values).toHaveLength(0); // not before the delay
    jest.advanceTimersByTime(1);
    expect(values).toEqual([0]); // fires exactly at 30ms

    cleanup();
  });

  test('emits only once', () => {
    const source = timer(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    jest.advanceTimersByTime(100);
    cleanup();

    expect(values).toEqual([0]);
  });

  test('cleanup cancels timer if not fired', () => {
    const source = timer(100);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    cleanup(); // Cancel immediately
    jest.advanceTimersByTime(150);

    expect(values).toHaveLength(0);
  });

  test('cleanup after firing has no effect', () => {
    const source = timer(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    jest.advanceTimersByTime(50);
    cleanup(); // Should be safe to call after timer fired

    expect(values).toEqual([0]);
  });

  test('multiple starts create independent timers', () => {
    const source = timer(30);
    const values1: number[] = [];
    const values2: number[] = [];

    const cleanup1 = source.start((v) => values1.push(v));
    const cleanup2 = source.start((v) => values2.push(v));
    jest.advanceTimersByTime(50);
    cleanup1();
    cleanup2();

    expect(values1).toEqual([0]);
    expect(values2).toEqual([0]);
  });
});
