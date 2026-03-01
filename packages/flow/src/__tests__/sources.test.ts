/**
 * Tests for Flow Sources
 */

import { describe, expect, test } from 'bun:test';
import { interval, isSource, timer } from '../sources';
import { wait } from './fixtures';

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
  test('creates source with __source marker', () => {
    const source = interval(100);

    expect(source.__source).toBeTrue();
    expect(typeof source.start).toBe('function');
  });

  test('emits incrementing numbers starting at 0', async () => {
    expect.hasAssertions();
    const source = interval(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    await wait(70);
    cleanup();

    expect(values[0]).toBe(0);
    expect(values[1]).toBe(1);
    expect(values[2]).toBe(2);
  });

  test('emits at specified interval', async () => {
    expect.hasAssertions();
    const source = interval(30);
    const values: number[] = [];
    const timestamps: number[] = [];
    const startTime = Date.now();

    const cleanup = source.start((v) => {
      values.push(v);
      timestamps.push(Date.now() - startTime);
    });

    await wait(100);
    cleanup();

    // Should have at least 2-3 emissions in 100ms with 30ms interval
    expect(values.length).toBeGreaterThanOrEqual(2);
    // First emission should be around 30ms
    expect(timestamps[0]).toBeGreaterThanOrEqual(25);
    expect(timestamps[0]).toBeLessThan(50);
  });

  test('cleanup stops interval', async () => {
    expect.hasAssertions();
    const source = interval(10);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    await wait(35);
    const countBeforeCleanup = values.length;
    cleanup();
    await wait(50);

    expect(values.length).toBe(countBeforeCleanup);
  });

  test('multiple starts create independent intervals', async () => {
    expect.hasAssertions();
    const source = interval(20);
    const values1: number[] = [];
    const values2: number[] = [];

    const cleanup1 = source.start((v) => values1.push(v));
    const cleanup2 = source.start((v) => values2.push(v));

    await wait(50);
    cleanup1();
    cleanup2();

    // Both should have emitted independently
    expect(values1.length).toBeGreaterThan(0);
    expect(values2.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// timer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('timer', () => {
  test('creates source with __source marker', () => {
    const source = timer(100);

    expect(source.__source).toBeTrue();
    expect(typeof source.start).toBe('function');
  });

  test('emits 0 after specified delay', async () => {
    expect.hasAssertions();
    const source = timer(30);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    expect(values).toHaveLength(0);
    await wait(50);
    cleanup();

    expect(values).toEqual([0]);
  });

  test('emits only once', async () => {
    expect.hasAssertions();
    const source = timer(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    await wait(100);
    cleanup();

    expect(values).toEqual([0]);
  });

  test('cleanup cancels timer if not fired', async () => {
    expect.hasAssertions();
    const source = timer(100);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));
    cleanup(); // Cancel immediately

    await wait(150);

    expect(values).toHaveLength(0);
  });

  test('cleanup after firing has no effect', async () => {
    expect.hasAssertions();
    const source = timer(20);
    const values: number[] = [];

    const cleanup = source.start((v) => values.push(v));

    await wait(50);
    cleanup(); // Should be safe to call after timer fired

    expect(values).toEqual([0]);
  });

  test('multiple starts create independent timers', async () => {
    expect.hasAssertions();
    const source = timer(30);
    const values1: number[] = [];
    const values2: number[] = [];

    const cleanup1 = source.start((v) => values1.push(v));
    const cleanup2 = source.start((v) => values2.push(v));

    await wait(50);
    cleanup1();
    cleanup2();

    expect(values1).toEqual([0]);
    expect(values2).toEqual([0]);
  });
});
