/**
 * Tests for RingBuffer — bounded queue used by Analytics.recent().
 */
import { describe, expect, test } from 'bun:test';
import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  describe('push + snapshot', () => {
    test('collects items up to capacity', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.snapshot()).toEqual([1, 2, 3]);
    });

    test('evicts oldest item when capacity is exceeded', () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4);
      // 1 was evicted; 4 is newest
      expect(buf.snapshot()).toEqual([2, 3, 4]);
    });

    test('snapshot returns a copy, not the backing array', () => {
      const buf = new RingBuffer<number>(5);
      buf.push(10);
      const snap = buf.snapshot();
      snap.push(99);
      // Mutation of the snapshot must not affect the buffer.
      expect(buf.snapshot()).toEqual([10]);
    });
  });

  describe('length getter', () => {
    test('reports 0 on an empty buffer', () => {
      const buf = new RingBuffer<string>(10);
      expect(buf).toHaveLength(0);
    });

    test('tracks the count up to capacity', () => {
      const buf = new RingBuffer<string>(3);
      expect(buf).toHaveLength(0);
      buf.push('a');
      expect(buf).toHaveLength(1);
      buf.push('b');
      buf.push('c');
      expect(buf).toHaveLength(3);
    });

    test('stays at capacity after overflow', () => {
      const buf = new RingBuffer<string>(2);
      buf.push('a');
      buf.push('b');
      buf.push('c');
      // Overflowed; length must remain 2 (= capacity), not grow past it.
      expect(buf).toHaveLength(2);
    });
  });

  describe('capacity getter', () => {
    test('reflects the constructor argument', () => {
      expect(new RingBuffer<number>(1).capacity).toBe(1);
      expect(new RingBuffer<number>(1000).capacity).toBe(1000);
    });

    test('capacity is independent of current length', () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.capacity).toBe(5);
      buf.push(1);
      expect(buf.capacity).toBe(5);
    });
  });

  describe('capacity=1 edge case', () => {
    test('holds only the most recent item', () => {
      const buf = new RingBuffer<string>(1);
      buf.push('first');
      buf.push('second');
      expect(buf.snapshot()).toEqual(['second']);
      expect(buf).toHaveLength(1);
    });
  });
});
