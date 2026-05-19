import { describe, expect, test } from 'bun:test';
import { singleFlight } from '../../internal/single-flight';

describe('singleFlight', () => {
  test('coalesces concurrent calls into a single underlying invocation', async () => {
    let calls = 0;
    let resolveInner: (v: number) => void = () => {};
    const inner = () =>
      new Promise<number>((resolve) => {
        calls++;
        resolveInner = resolve;
      });

    const sf = singleFlight(inner);
    const a = sf();
    const b = sf();
    const c = sf();

    expect(calls).toBe(1);
    resolveInner(42);

    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(await c).toBe(42);
  });

  test('clears the cache after success so the next call invokes again', async () => {
    let calls = 0;
    const sf = singleFlight(async () => ++calls);

    expect(await sf()).toBe(1);
    expect(await sf()).toBe(2);
    expect(await sf()).toBe(3);
    expect(calls).toBe(3);
  });

  test('clears the cache after rejection so callers can retry', async () => {
    let attempts = 0;
    const sf = singleFlight(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('boom');
      }
      return 'ok';
    });

    await expect(sf()).rejects.toThrow('boom');
    expect(await sf()).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('shares the rejection across concurrent waiters', async () => {
    const sf = singleFlight(async () => {
      throw new Error('shared failure');
    });

    const a = sf().catch((e) => e.message);
    const b = sf().catch((e) => e.message);

    expect(await a).toBe('shared failure');
    expect(await b).toBe('shared failure');
  });
});
