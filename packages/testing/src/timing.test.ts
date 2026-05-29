import { describe, expect, test } from 'bun:test';
import { flush, waitFor } from './timing';

describe('flush', () => {
  test('resolves after the default delay (~25ms)', async () => {
    const start = Date.now();
    await flush();
    const elapsed = Date.now() - start;
    // The default is 25ms; allow generous lower bound (15ms) for scheduler jitter
    // and an upper bound that is just defensive — slow CI can spike but the call
    // must complete in well under a second.
    expect(elapsed).toBeGreaterThanOrEqual(15);
    expect(elapsed).toBeLessThan(500);
  });

  test('respects an explicit delay argument', async () => {
    const start = Date.now();
    await flush(60);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  test('resolves to undefined', async () => {
    const result = await flush(1);
    expect(result).toBeUndefined();
  });

  test('zero ms still returns a promise that resolves', async () => {
    await expect(flush(0)).resolves.toBeUndefined();
  });
});

describe('waitFor', () => {
  test('returns immediately when predicate is already true', async () => {
    const start = Date.now();
    await waitFor(() => true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test('returns once the predicate becomes true', async () => {
    let flipped = false;
    setTimeout(() => {
      flipped = true;
    }, 30);

    await waitFor(() => flipped);
    expect(flipped).toBe(true);
  });

  test('throws on timeout with a helpful message', async () => {
    const start = Date.now();
    await expect(waitFor(() => false, 60)).rejects.toThrow(
      /predicate did not become true within 60ms/
    );
    const elapsed = Date.now() - start;
    // Should have waited approximately the timeout, not retried forever.
    expect(elapsed).toBeGreaterThanOrEqual(50);
    // Should not have hung forever — must be back well before the default 2s.
    expect(elapsed).toBeLessThan(500);
  });

  test('honors a custom message via the options-object form', async () => {
    await expect(
      waitFor(() => false, { timeoutMs: 30, message: 'thing never landed' })
    ).rejects.toThrow(/thing never landed/);
  });

  test('uses the default 2s timeout when none is supplied', async () => {
    // Confirm the default path (no explicit timeout) is exercised — we don't
    // wait the full two seconds, instead we flip the predicate quickly so the
    // function returns through the success branch under the default.
    let done = false;
    setTimeout(() => {
      done = true;
    }, 20);
    await waitFor(() => done);
    expect(done).toBe(true);
  });

  test('polls until the predicate satisfies', async () => {
    let counter = 0;
    await waitFor(() => {
      counter++;
      return counter >= 3;
    });
    expect(counter).toBeGreaterThanOrEqual(3);
  });
});
