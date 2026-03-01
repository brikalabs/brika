/**
 * Tests for RingBuffer - fixed-size circular buffer
 */

import { describe, expect, test } from 'bun:test';
import { RingBuffer } from '@/runtime/logs/utils/ring-buffer';

describe('RingBuffer', () => {
  test('stores items up to capacity', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(buffer.length).toBe(3);
    expect(buffer.snapshot()).toEqual([
      1,
      2,
      3,
    ]);
  });

  test('overwrites oldest items when full', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4); // Overwrites 1

    expect(buffer.length).toBe(3);
    expect(buffer.snapshot()).toEqual([
      2,
      3,
      4,
    ]);
  });

  test('continues overwriting as more items are added', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);
    buffer.push(5);
    buffer.push(6);

    expect(buffer.snapshot()).toEqual([
      4,
      5,
      6,
    ]);
  });

  test('returns empty array when buffer is empty', () => {
    const buffer = new RingBuffer<number>(3);

    expect(buffer.length).toBe(0);
    expect(buffer.snapshot()).toEqual([]);
  });

  test('returns correct length when partially filled', () => {
    const buffer = new RingBuffer<number>(5);

    buffer.push(1);
    buffer.push(2);

    expect(buffer.length).toBe(2);
    expect(buffer.capacity).toBe(5);
  });

  test('works with different types', () => {
    const buffer = new RingBuffer<string>(2);

    buffer.push('hello');
    buffer.push('world');

    expect(buffer.snapshot()).toEqual([
      'hello',
      'world',
    ]);
  });

  test('capacity getter returns max size', () => {
    const buffer = new RingBuffer<number>(10);

    expect(buffer.capacity).toBe(10);
  });

  test('snapshot returns new array each time', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);

    const snap1 = buffer.snapshot();
    const snap2 = buffer.snapshot();

    expect(snap1).not.toBe(snap2);
    expect(snap1).toEqual(snap2);
  });
});
