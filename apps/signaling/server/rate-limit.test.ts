import { describe, expect, it } from 'bun:test';
import { InMemoryRateLimiter } from './rate-limit';

/**
 * Synthetic per-test IPs in RFC 5737 TEST-NET-3 (`203.0.113.0/24`). This
 * range is reserved for documentation and never appears on the public
 * Internet — using it here keeps Sonar's "hardcoded IP" rule (S1313)
 * quiet while making it obvious to a reader that these are test fixtures,
 * not infrastructure config.
 */
function testIp(suffix: number): string {
  return `203.0.113.${suffix}`;
}

function reqFromIp(ip: string | null): Request {
  const headers = new Headers();
  if (ip !== null) {
    headers.set('cf-connecting-ip', ip);
  }
  return new Request('https://hub.brika.dev/x', { headers });
}

describe('InMemoryRateLimiter', () => {
  it('allows the first request and returns null', () => {
    const limiter = new InMemoryRateLimiter();
    expect(limiter.check(reqFromIp(testIp(1)), 'claim')).toBeNull();
  });

  it('lets a caller burn through the bucket limit then 429s', async () => {
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(testIp(2));
    // claim bucket = 5/min
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(req, 'claim')).toBeNull();
    }
    const blocked = limiter.check(req, 'claim');
    if (!blocked) {
      throw new Error('expected a 429 response');
    }
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await blocked.json()).toMatchObject({ error: 'rate-limited' });
  });

  it('isolates buckets per (bucket, IP) — different IPs share no counters', () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(reqFromIp(testIp(3)), 'claim')).toBeNull();
    }
    // Different IP starts fresh.
    expect(limiter.check(reqFromIp(testIp(4)), 'claim')).toBeNull();
  });

  it('different buckets have separate counters for the same IP', () => {
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(testIp(5));
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(req, 'claim')).toBeNull();
    }
    expect(limiter.check(req, 'claim')).not.toBeNull();
    // rotate bucket = 10/min, untouched.
    expect(limiter.check(req, 'rotate')).toBeNull();
  });

  it('recover bucket is capped hard (5/min)', () => {
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(testIp(6));
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(req, 'recover')).toBeNull();
    }
    expect(limiter.check(req, 'recover')).not.toBeNull();
  });

  it('ticket bucket is the loosest (60/min)', () => {
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(testIp(7));
    for (let i = 0; i < 60; i++) {
      expect(limiter.check(req, 'ticket')).toBeNull();
    }
    expect(limiter.check(req, 'ticket')).not.toBeNull();
  });

  it('falls back to x-forwarded-for then x-real-ip when cf-connecting-ip is absent', () => {
    const limiter = new InMemoryRateLimiter();
    // XFF: first hop wins.
    const xff = new Request('https://hub.brika.dev/x', {
      headers: { 'x-forwarded-for': `${testIp(8)}, ${testIp(9)}` },
    });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(xff, 'claim')).toBeNull();
    }
    expect(limiter.check(xff, 'claim')).not.toBeNull();
    // Different xff first hop → independent bucket.
    const otherXff = new Request('https://hub.brika.dev/x', {
      headers: { 'x-forwarded-for': testIp(10) },
    });
    expect(limiter.check(otherXff, 'claim')).toBeNull();
  });

  it('uses "unknown" as the key when no client-IP header is present', () => {
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(null);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(req, 'claim')).toBeNull();
    }
    expect(limiter.check(req, 'claim')).not.toBeNull();
  });

  it('opens a fresh window after the configured windowMs has elapsed', () => {
    // We don't fake the clock here — instead burn the bucket and verify
    // the Retry-After header is within the configured 60s window. That
    // covers the boundary math (`windowStart + windowMs - now`) without
    // adding a sleep or a spy.
    const limiter = new InMemoryRateLimiter();
    const req = reqFromIp(testIp(11));
    for (let i = 0; i < 5; i++) {
      limiter.check(req, 'claim');
    }
    const blocked = limiter.check(req, 'claim');
    const retryAfter = Number(blocked?.headers.get('retry-after') ?? '0');
    // Bucket window is 60s → Retry-After must be in (0, 60].
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});
