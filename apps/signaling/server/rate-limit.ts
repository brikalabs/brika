/**
 * Tiny in-memory token-bucket rate limiter, per (bucket, IP) key.
 *
 * Runtime-neutral — no `node:`/`bun:` imports. Used by both the CF worker
 * (per-isolate, fail-open enough that CF's own rate-limit rules can do the
 * heavy lifting upstream) and the standalone server (authoritative for a
 * single-process deploy).
 *
 * Bucket policy is fixed for now: each bucket allows N requests per window.
 * Keys are pruned lazily on access; a passive TTL-cleanup avoids the need
 * for a background timer that complicates Workers + tests.
 */

export type RateBucket = 'claim' | 'rotate' | 'recover' | 'ticket' | 'connect';

interface BucketCfg {
  /** Max requests per window. */
  readonly limit: number;
  /** Window length in ms. */
  readonly windowMs: number;
}

const POLICY: Readonly<Record<RateBucket, BucketCfg>> = {
  // Claim is the most abuseable — strict per-IP cap so a single client can't
  // squat through enumeration.
  claim: { limit: 5, windowMs: 60_000 },
  // Token rotations are owner-authenticated; a slightly looser cap is fine
  // and protects against credential-bruteforce loops.
  rotate: { limit: 10, windowMs: 60_000 },
  // Recovery is unauthenticated (the recovery code IS the auth); cap hard.
  recover: { limit: 5, windowMs: 60_000 },
  // Ticket mints happen at the start of every browser session; allow more.
  ticket: { limit: 60, windowMs: 60_000 },
  // WebSocket upgrades (`/v1/hub` + `/v1/client`). Each upgrade does an
  // unauthenticated-until-checked SHA-256 + indexed DB lookup (hub) or an HMAC
  // ticket verify (client), so cap per-IP to blunt connection-flood / token-
  // guessing DB load. Generous enough to absorb a hub's reconnect storm on a
  // flaky link and many browser sessions behind one NAT.
  connect: { limit: 60, windowMs: 60_000 },
};

interface Counter {
  count: number;
  /** Unix ms when the current window opened. */
  windowStart: number;
}

export class InMemoryRateLimiter {
  readonly #buckets = new Map<string, Counter>();

  /**
   * @returns null when allowed; a 429 Response when over the cap.
   */
  check(req: Request, bucket: RateBucket): Response | null {
    const ip = clientIpFromRequest(req) ?? 'unknown';
    const key = `${bucket}:${ip}`;
    const cfg = POLICY[bucket];
    const now = Date.now();
    const existing = this.#buckets.get(key);
    if (!existing || now - existing.windowStart >= cfg.windowMs) {
      this.#buckets.set(key, { count: 1, windowStart: now });
      this.#prune(now);
      return null;
    }
    if (existing.count >= cfg.limit) {
      const retryAfter = Math.ceil((existing.windowStart + cfg.windowMs - now) / 1000);
      return new Response(JSON.stringify({ error: 'rate-limited' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.max(1, retryAfter)),
        },
      });
    }
    existing.count += 1;
    return null;
  }

  /** Drop entries whose window has fully elapsed. Cheap O(buckets) walk. */
  #prune(now: number): void {
    if (this.#buckets.size < 256) {
      return;
    }
    for (const [key, c] of this.#buckets) {
      const policyBucket = key.split(':', 1)[0] as RateBucket;
      const cfg = POLICY[policyBucket];
      if (cfg && now - c.windowStart >= cfg.windowMs) {
        this.#buckets.delete(key);
      }
    }
  }
}

/**
 * Best-available client IP from a Request, shared by every transport (rate
 * limiter, CF DO, Bun standalone). Cloudflare's `cf-connecting-ip` is
 * canonical; behind a reverse proxy (or in dev) we fall back to
 * `x-forwarded-for` then `x-real-ip`. On Bun `cf-connecting-ip` is simply
 * absent, so the fallbacks apply — no behavioural divergence.
 */
export function clientIpFromRequest(req: Request): string | undefined {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) {
    return cf;
  }
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.headers.get('x-real-ip') ?? undefined;
}
