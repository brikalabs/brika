/**
 * Tests for rate limiting middleware (sliding window counter)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { RateLimitStore, rateLimit } from '../middleware/rate-limit';

/* ------------------------------------------------------------------ */
/*  RateLimitStore unit tests                                         */
/* ------------------------------------------------------------------ */

describe('RateLimitStore', () => {
  let store: RateLimitStore;

  afterEach(() => store?.destroy());

  test('allows requests under the limit', () => {
    store = new RateLimitStore(60_000, 5, 0);
    const now = 1_000_000;

    for (let i = 0; i < 5; i++) {
      const result = store.check('ip-1', now + i);
      expect(result.allowed).toBe(true);
    }
  });

  test('rejects requests over the limit', () => {
    store = new RateLimitStore(60_000, 3, 0);
    const now = 1_000_000;

    store.check('ip-1', now);
    store.check('ip-1', now + 1);
    store.check('ip-1', now + 2);

    const result = store.check('ip-1', now + 3);
    expect(result.allowed).toBe(false);
    expect(result.current).toBeGreaterThanOrEqual(3);
  });

  test('tracks different keys independently', () => {
    store = new RateLimitStore(60_000, 2, 0);
    const now = 1_000_000;

    store.check('ip-1', now);
    store.check('ip-1', now + 1);
    const rejected = store.check('ip-1', now + 2);
    expect(rejected.allowed).toBe(false);

    const allowed = store.check('ip-2', now + 3);
    expect(allowed.allowed).toBe(true);
  });

  test('remaining count decrements correctly', () => {
    store = new RateLimitStore(60_000, 5, 0);
    const now = 1_000_000;

    const r1 = store.check('ip-1', now);
    expect(r1.current).toBe(1);

    const r2 = store.check('ip-1', now + 1);
    expect(r2.current).toBe(2);

    const r3 = store.check('ip-1', now + 2);
    expect(r3.current).toBe(3);
  });

  test('resets after window elapses', () => {
    store = new RateLimitStore(60_000, 2, 0);
    const now = 60_000;

    store.check('ip-1', now);
    store.check('ip-1', now + 1);
    const rejected = store.check('ip-1', now + 2);
    expect(rejected.allowed).toBe(false);

    // Skip past 2 full windows so both prev + curr reset
    const result = store.check('ip-1', now + 120_001);
    expect(result.allowed).toBe(true);
  });

  test('sliding window uses weighted previous count', () => {
    store = new RateLimitStore(10_000, 10, 0);

    // Fill the first window with 10 requests
    const windowStart = 10_000;
    for (let i = 0; i < 10; i++) {
      store.check('ip-1', windowStart + i);
    }

    // At the start of the next window, weight=1.0 so prev fully counts
    const earlyResult = store.check('ip-1', windowStart + 10_000);
    expect(earlyResult.allowed).toBe(false);

    // Near the end of the next window, weight≈0, so prev barely counts
    const lateResult = store.check('ip-1', windowStart + 19_999);
    expect(lateResult.allowed).toBe(true);
  });

  test('resetAt is end of current window', () => {
    store = new RateLimitStore(60_000, 5, 0);
    const now = 90_000; // mid-window: currStart=60000, resetAt=120000

    const result = store.check('ip-1', now);
    expect(result.resetAt).toBe(120_000);
  });

  test('cleanup removes stale entries', async () => {
    store = new RateLimitStore(1_000, 5, 0);

    store.check('old', 1_000);
    store.check('recent', 10_000);

    expect(store.size).toBe(2);

    // Manually trigger sweep behavior: entries older than 2*window are removed
    // We'll use a new store with short cleanup for this
    store.destroy();
    store = new RateLimitStore(1_000, 5, 50);

    store.check('ip-1', Date.now() - 5_000);
    store.check('ip-2', Date.now());

    // Wait for cleanup to run
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Only the recent entry should remain
    expect(store.size).toBe(1);
  });

  test('evicts oldest entries when maxKeys is reached', () => {
    store = new RateLimitStore(60_000, 100, 0, 3);
    const now = 60_000;

    store.check('ip-1', now);
    store.check('ip-2', now + 1);
    store.check('ip-3', now + 2);
    expect(store.size).toBe(3);

    // Adding a 4th key triggers eviction of the oldest
    store.check('ip-4', now + 3);
    expect(store.size).toBeLessThanOrEqual(3);

    // The new key should still be tracked
    const result = store.check('ip-4', now + 4);
    expect(result.current).toBe(2);
  });

  test('eviction prefers expired entries over fresh ones', () => {
    store = new RateLimitStore(10_000, 100, 0, 3);

    // Create entries: one old (expired), two recent
    store.check('old-ip', 10_000);
    store.check('recent-1', 40_000);
    store.check('recent-2', 40_001);
    expect(store.size).toBe(3);

    // New entry at a time where old-ip is expired (>2 windows old)
    store.check('new-ip', 40_002);
    expect(store.size).toBeLessThanOrEqual(3);
  });

  test('destroy clears all entries and stops cleanup', () => {
    store = new RateLimitStore(60_000, 5, 100);

    store.check('ip-1', Date.now());
    expect(store.size).toBe(1);

    store.destroy();
    expect(store.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  rateLimit middleware integration tests                             */
/* ------------------------------------------------------------------ */

describe('rateLimit middleware', () => {
  function createTestApp(options: Parameters<typeof rateLimit>[0]) {
    const app = new Hono();
    app.use(
      '*',
      rateLimit({
        ...options,
        cleanupInterval: 0,
      })
    );
    app.get('/test', (c) =>
      c.json({
        ok: true,
      })
    );
    app.post('/test', (c) =>
      c.json({
        ok: true,
      })
    );
    return app;
  }

  function req(app: Hono, path = '/test', ip = '127.0.0.1') {
    return app.request(path, {
      headers: {
        'x-real-ip': ip,
      },
    });
  }

  test('allows requests under the limit', async () => {
    const app = createTestApp({
      window: 60,
      max: 3,
    });

    const res = await req(app);
    expect(res.status).toBe(200);
  });

  test('returns 429 when limit exceeded', async () => {
    const app = createTestApp({
      window: 60,
      max: 2,
    });

    await req(app);
    await req(app);
    const res = await req(app);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too many requests');
  });

  test('uses custom error message', async () => {
    const app = createTestApp({
      window: 60,
      max: 1,
      message: 'Slow down',
    });

    await req(app);
    const res = await req(app);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Slow down');
  });

  test('sets rate limit headers on every response', async () => {
    const app = createTestApp({
      window: 60,
      max: 5,
    });

    const res = await req(app);

    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  test('remaining header decrements', async () => {
    const app = createTestApp({
      window: 60,
      max: 5,
    });

    const r1 = await req(app);
    const r2 = await req(app);

    const rem1 = Number(r1.headers.get('X-RateLimit-Remaining'));
    const rem2 = Number(r2.headers.get('X-RateLimit-Remaining'));
    expect(rem2).toBeLessThan(rem1);
  });

  test('429 response includes Retry-After header', async () => {
    const app = createTestApp({
      window: 60,
      max: 1,
    });

    await req(app);
    const res = await req(app);

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('different IPs are tracked independently', async () => {
    const app = createTestApp({
      window: 60,
      max: 1,
    });

    const res1 = await req(app, '/test', '10.0.0.1');
    expect(res1.status).toBe(200);

    const res2 = await req(app, '/test', '10.0.0.2');
    expect(res2.status).toBe(200);
  });

  test('same IP is rate limited across requests', async () => {
    const app = createTestApp({
      window: 60,
      max: 1,
    });

    await req(app, '/test', '10.0.0.1');
    const res = await req(app, '/test', '10.0.0.1');
    expect(res.status).toBe(429);
  });

  test('supports custom key extractor', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimit({
        window: 60,
        max: 1,
        cleanupInterval: 0,
        key: (c) => c.req.header('x-api-key') ?? 'anon',
      })
    );
    app.get('/test', (c) =>
      c.json({
        ok: true,
      })
    );

    // Same IP but different API keys — should be independent
    const r1 = await app.request('/test', {
      headers: {
        'x-real-ip': '10.0.0.1',
        'x-api-key': 'key-a',
      },
    });
    expect(r1.status).toBe(200);

    const r2 = await app.request('/test', {
      headers: {
        'x-real-ip': '10.0.0.1',
        'x-api-key': 'key-b',
      },
    });
    expect(r2.status).toBe(200);

    // Same API key — should be limited
    const r3 = await app.request('/test', {
      headers: {
        'x-real-ip': '10.0.0.1',
        'x-api-key': 'key-a',
      },
    });
    expect(r3.status).toBe(429);
  });
});
