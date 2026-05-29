/**
 * Per-plugin concurrency limit. Verifies FIFO ordering, isolation between
 * plugin uids, and that releasing hands the slot to the next waiter
 * without briefly leaking it to a fresh arrival.
 */

import { describe, expect, test } from 'bun:test';
import { sleep } from '@brika/testing';
import { ConcurrencyLimiter } from './semaphore';

describe('ConcurrencyLimiter', () => {
  test('available slots reflect acquire/release', async () => {
    const limiter = new ConcurrencyLimiter({ slotsPerPlugin: 2 });
    expect(limiter.available('p')).toBe(2);
    const r1 = await limiter.acquire('p');
    expect(limiter.available('p')).toBe(1);
    const r2 = await limiter.acquire('p');
    expect(limiter.available('p')).toBe(0);
    r1();
    expect(limiter.available('p')).toBe(1);
    r2();
    expect(limiter.available('p')).toBe(2);
  });

  test('queues waiters past the cap', async () => {
    const limiter = new ConcurrencyLimiter({ slotsPerPlugin: 1 });
    const r1 = await limiter.acquire('p');
    let queuedFinished = false;
    const queued = limiter.acquire('p').then((r) => {
      queuedFinished = true;
      r();
    });
    // Negative assertion — the waiter must not resolve while the slot
    // is still held. A short window is the right tool here.
    await sleep(5);
    expect(queuedFinished).toBe(false);
    expect(limiter.waiting('p')).toBe(1);
    r1();
    await queued;
    expect(queuedFinished).toBe(true);
    expect(limiter.waiting('p')).toBe(0);
  });

  test('different plugin uids do not contend', async () => {
    const limiter = new ConcurrencyLimiter({ slotsPerPlugin: 1 });
    const ra = await limiter.acquire('a');
    // b has its own bucket — still has its slot.
    const rb = await limiter.acquire('b');
    expect(limiter.available('a')).toBe(0);
    expect(limiter.available('b')).toBe(0);
    ra();
    rb();
  });

  test('FIFO ordering of waiters', async () => {
    const limiter = new ConcurrencyLimiter({ slotsPerPlugin: 1 });
    const held = await limiter.acquire('p');
    const order: number[] = [];
    const w1 = limiter.acquire('p').then((r) => {
      order.push(1);
      r();
    });
    const w2 = limiter.acquire('p').then((r) => {
      order.push(2);
      r();
    });
    const w3 = limiter.acquire('p').then((r) => {
      order.push(3);
      r();
    });
    held();
    await Promise.all([w1, w2, w3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('release hands the slot directly (no transient slot leak)', async () => {
    const limiter = new ConcurrencyLimiter({ slotsPerPlugin: 1 });
    const held = await limiter.acquire('p');
    // Queue a waiter.
    const waiting = limiter.acquire('p');
    // available stays 0 because the slot is in flight.
    expect(limiter.available('p')).toBe(0);
    held();
    // After release, the waiter immediately holds the slot — `available`
    // should still be 0 (one slot, one in-use), not transiently 1.
    expect(limiter.available('p')).toBe(0);
    const release = await waiting;
    release();
    expect(limiter.available('p')).toBe(1);
  });

  test('defaults to DEFAULT_MAX_CONCURRENT when no opts given', () => {
    const limiter = new ConcurrencyLimiter();
    // Default is 16; we just verify it's > 1 and stable across reads.
    const a = limiter.available('p');
    expect(a).toBeGreaterThan(1);
    expect(limiter.available('p')).toBe(a);
  });
});
