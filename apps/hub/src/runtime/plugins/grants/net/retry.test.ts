/**
 * Retry policy: Retry-After parsing, retry decisions, abortable sleep.
 */

import { describe, expect, test } from 'bun:test';
import type { FetchArgs } from '@brika/sdk/grants';
import { abortableSleep, jitter, parseRetryAfter, shouldRetry } from './retry';

const MAX = 30_000;

const baseArgs: FetchArgs = {
  url: 'https://api.example.com/',
  method: 'GET',
};

describe('parseRetryAfter', () => {
  test('returns null for missing or empty input', () => {
    expect(parseRetryAfter(null, MAX)).toBeNull();
    expect(parseRetryAfter(undefined, MAX)).toBeNull();
    expect(parseRetryAfter('', MAX)).toBeNull();
  });

  test('parses delta-seconds and clamps to maxMs', () => {
    expect(parseRetryAfter('10', MAX)).toBe(10_000);
    expect(parseRetryAfter('60', 30_000)).toBe(30_000);
    expect(parseRetryAfter('0', MAX)).toBe(0);
  });

  test('parses HTTP-date and clamps negatives to 0', () => {
    // A date in the past — clamp to 0.
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past, MAX)).toBe(0);
    // A date in the future — within maxMs ceiling.
    const futureMs = 5_000;
    const future = new Date(Date.now() + futureMs).toUTCString();
    const parsed = parseRetryAfter(future, MAX);
    // Be lenient on the rounding — the test fires after Date.now() captures.
    expect(parsed).not.toBeNull();
    expect(parsed).toBeGreaterThanOrEqual(0);
    expect(parsed).toBeLessThanOrEqual(futureMs);
  });

  test('returns null on garbage (so fast-spin retry never happens)', () => {
    expect(parseRetryAfter('garbage', MAX)).toBeNull();
    expect(parseRetryAfter('not-a-date', MAX)).toBeNull();
  });

  test('rejects negative seconds', () => {
    expect(parseRetryAfter('-5', MAX)).toBeNull();
  });
});

describe('jitter', () => {
  test('produces a value in ±25% of input', () => {
    for (let i = 0; i < 100; i++) {
      const out = jitter(1000);
      expect(out).toBeGreaterThanOrEqual(750);
      expect(out).toBeLessThanOrEqual(1250);
    }
  });
});

describe('shouldRetry', () => {
  test('no retry policy → no retry', () => {
    const res = new Response('', { status: 503 });
    expect(shouldRetry(res, undefined, 0, baseArgs)).toBeNull();
  });

  test('non-retryable status → no retry', () => {
    const res = new Response('', { status: 400 });
    expect(
      shouldRetry(res, undefined, 0, {
        ...baseArgs,
        retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 100 },
      })
    ).toBeNull();
  });

  test('retryable status → returns a backoff delay', () => {
    const res = new Response('', { status: 503 });
    const delay = shouldRetry(res, undefined, 0, {
      ...baseArgs,
      retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 100 },
    });
    // 100 * 2^0 = 100, jittered ±25% → 75-125.
    expect(delay).not.toBeNull();
    expect(delay).toBeGreaterThanOrEqual(75);
    expect(delay).toBeLessThanOrEqual(125);
  });

  test('respects Retry-After header when configured', () => {
    const res = new Response('', { status: 429, headers: { 'Retry-After': '7' } });
    const delay = shouldRetry(res, undefined, 0, {
      ...baseArgs,
      retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 100 },
    });
    expect(delay).toBe(7_000);
  });

  test('falls back to backoff when Retry-After is garbage', () => {
    const res = new Response('', { status: 429, headers: { 'Retry-After': 'garbage' } });
    const delay = shouldRetry(res, undefined, 0, {
      ...baseArgs,
      retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 100 },
    });
    expect(delay).not.toBeNull();
    expect(delay).toBeLessThanOrEqual(125);
  });

  test('does NOT retry non-idempotent methods without idempotencyKey', () => {
    const res = new Response('', { status: 503 });
    for (const method of ['POST', 'PATCH'] as const) {
      const delay = shouldRetry(res, undefined, 0, {
        ...baseArgs,
        method,
        body: '{}',
        retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 100 },
      });
      expect(delay).toBeNull();
    }
  });

  test('DOES retry POST when idempotencyKey is present', () => {
    const res = new Response('', { status: 503 });
    const delay = shouldRetry(res, undefined, 0, {
      ...baseArgs,
      method: 'POST',
      body: '{}',
      idempotencyKey: 'abc',
      retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 100 },
    });
    expect(delay).not.toBeNull();
  });

  test('stops at maxAttempts boundary', () => {
    const res = new Response('', { status: 503 });
    const delay = shouldRetry(res, undefined, 2, {
      ...baseArgs,
      retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 100 },
    });
    // attemptIdx 2 + 1 = 3 = maxAttempts → no more retries.
    expect(delay).toBeNull();
  });

  test('transport error → retry with backoff', () => {
    const delay = shouldRetry(null, new Error('econnreset'), 0, {
      ...baseArgs,
      retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 100 },
    });
    expect(delay).not.toBeNull();
  });

  test('exponential backoff caps at MAX_BACKOFF_MS', () => {
    const res = new Response('', { status: 503 });
    const delay = shouldRetry(res, undefined, 20, {
      ...baseArgs,
      retry: { maxAttempts: 30, respectRetryAfter: false, backoffMs: 1000 },
    });
    // 1000 * 2^20 vastly exceeds the cap; jittered ±25% means upper bound 30000 * 1.25 = 37500.
    expect(delay).not.toBeNull();
    expect(delay).toBeLessThanOrEqual(37_500);
  });
});

describe('abortableSleep', () => {
  test('resolves after the requested delay when no abort fires', async () => {
    const start = Date.now();
    await abortableSleep(50, new AbortController().signal);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  test('rejects immediately if signal already aborted', async () => {
    const c = new AbortController();
    c.abort(new Error('pre-aborted'));
    let thrown: unknown;
    try {
      await abortableSleep(60_000, c.signal);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
  });

  test('rejects when signal fires mid-sleep, well before the delay completes', async () => {
    const c = new AbortController();
    queueMicrotask(() => c.abort(new Error('test')));
    const start = Date.now();
    let thrown: unknown;
    try {
      await abortableSleep(60_000, c.signal);
    } catch (e) {
      thrown = e;
    }
    const elapsed = Date.now() - start;
    expect(thrown).toBeInstanceOf(Error);
    expect(elapsed).toBeLessThan(1_000);
  });
});
