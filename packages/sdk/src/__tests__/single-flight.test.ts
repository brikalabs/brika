import { describe, expect, test } from 'bun:test';
import { singleFlight } from '../internal/single-flight';

describe('singleFlight', () => {
  test('coalesces concurrent calls to a single underlying invocation', async () => {
    let calls = 0;
    const fn = singleFlight(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });

    const results = await Promise.all([fn(), fn(), fn(), fn(), fn()]);

    expect(calls).toBe(1);
    expect(results).toEqual([1, 1, 1, 1, 1]);
  });

  test('all coalesced callers share the same rejection', async () => {
    let calls = 0;
    const fn = singleFlight(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('boom');
    });

    const settled = await Promise.allSettled([fn(), fn(), fn()]);

    expect(calls).toBe(1);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    for (const s of settled) {
      if (s.status === 'rejected') {
        expect((s.reason as Error).message).toBe('boom');
      }
    }
  });

  test('the slot clears after settle so the next call starts fresh', async () => {
    let calls = 0;
    const fn = singleFlight(async () => {
      calls++;
      return calls;
    });

    expect(await fn()).toBe(1);
    expect(await fn()).toBe(2);
    expect(await fn()).toBe(3);
  });

  test('the slot clears even after rejection', async () => {
    let calls = 0;
    const fn = singleFlight(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('first only');
      }
      return calls;
    });

    await expect(fn()).rejects.toThrow('first only');
    // Second call must start a new in-flight execution.
    expect(await fn()).toBe(2);
  });

  test('calls arriving DURING the same in-flight see the same result', async () => {
    let calls = 0;
    let resolveInner: ((value: string) => void) | undefined;
    const fn = singleFlight(
      () =>
        new Promise<string>((r) => {
          calls++;
          resolveInner = r;
        })
    );

    const a = fn();
    const b = fn();
    expect(calls).toBe(1);

    resolveInner?.('done');
    expect(await a).toBe('done');
    expect(await b).toBe('done');
  });
});
