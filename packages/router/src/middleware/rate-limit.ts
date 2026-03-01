/**
 * @brika/router — Rate Limiting Middleware
 *
 * Sliding window counter algorithm for accurate, memory-efficient rate limiting.
 * Interpolates between two fixed windows to prevent boundary-burst attacks
 * while using only ~48 bytes per tracked key.
 *
 * @example
 * ```ts
 * import { rateLimit } from '@brika/router';
 *
 * // Per-route: 5 requests per 60 seconds (login brute-force protection)
 * route.post({
 *   path: '/login',
 *   middleware: [rateLimit({ window: 60, max: 5 })],
 *   handler: ...
 * })
 *
 * // Custom key extractor
 * rateLimit({ window: 60, max: 100, key: (c) => c.req.header('x-api-key') ?? 'anon' })
 * ```
 */

import type { Context } from 'hono';
import type { Middleware } from '../types';

export interface RateLimitOptions {
  /** Time window in seconds */
  window: number;
  /** Maximum requests allowed per window */
  max: number;
  /** Custom key extractor (default: x-real-ip header) */
  key?: (c: Context) => string;
  /** Interval in ms between expired-entry sweeps (default: 60000, 0 to disable) */
  cleanupInterval?: number;
  /** Max tracked keys before eviction kicks in (default: 10000). Prevents memory exhaustion from IP rotation attacks. */
  maxKeys?: number;
  /** Custom 429 error message */
  message?: string;
}

/** Tracks request counts for two consecutive windows per key */
interface RateLimitEntry {
  prevCount: number;
  currCount: number;
  currStart: number;
}

interface CheckResult {
  allowed: boolean;
  current: number;
  resetAt: number;
}

export class RateLimitStore {
  readonly #windowMs: number;
  readonly #max: number;
  readonly #maxKeys: number;
  readonly #entries = new Map<string, RateLimitEntry>();
  #cleanup: ReturnType<typeof setInterval> | null = null;

  constructor(windowMs: number, max: number, cleanupInterval: number, maxKeys: number = 10_000) {
    this.#windowMs = windowMs;
    this.#max = max;
    this.#maxKeys = maxKeys;

    if (cleanupInterval > 0) {
      this.#cleanup = setInterval(() => this.#sweep(), cleanupInterval);
      this.#cleanup.unref();
    }
  }

  check(key: string, now: number = Date.now()): CheckResult {
    const windowMs = this.#windowMs;
    const currStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = currStart + windowMs;

    let entry = this.#entries.get(key);

    if (!entry) {
      // Evict stale entries when at capacity to prevent memory exhaustion
      if (this.#entries.size >= this.#maxKeys) {
        this.#evict(now);
      }
      entry = {
        prevCount: 0,
        currCount: 0,
        currStart,
      };
      this.#entries.set(key, entry);
    }

    // Rotate windows if we've moved past the current window
    if (now >= entry.currStart + windowMs) {
      if (now >= entry.currStart + windowMs * 2) {
        // Skipped an entire window — both counts reset
        entry.prevCount = 0;
      } else {
        entry.prevCount = entry.currCount;
      }
      entry.currCount = 0;
      entry.currStart = currStart;
    }

    // Sliding window estimate
    const elapsed = now - entry.currStart;
    const weight = 1 - elapsed / windowMs;
    const estimate = entry.prevCount * weight + entry.currCount;

    if (estimate >= this.#max) {
      return {
        allowed: false,
        current: Math.ceil(estimate),
        resetAt,
      };
    }

    entry.currCount++;
    return {
      allowed: true,
      current: Math.ceil(estimate) + 1,
      resetAt,
    };
  }

  get size(): number {
    return this.#entries.size;
  }

  /** Remove entries whose last activity is older than 2 windows */
  #sweep(): void {
    const cutoff = Date.now() - this.#windowMs * 2;
    for (const [key, entry] of this.#entries) {
      if (entry.currStart < cutoff) {
        this.#entries.delete(key);
      }
    }
  }

  /** Evict oldest entries when store is at capacity */
  #evict(now: number): void {
    // First try a normal sweep — often sufficient
    const cutoff = now - this.#windowMs * 2;
    for (const [key, entry] of this.#entries) {
      if (entry.currStart < cutoff) {
        this.#entries.delete(key);
      }
    }
    // Still at capacity — drop oldest entries (Map iterates in insertion order)
    if (this.#entries.size >= this.#maxKeys) {
      const toRemove = this.#entries.size - this.#maxKeys + 1;
      let removed = 0;
      for (const key of this.#entries.keys()) {
        if (removed >= toRemove) {
          break;
        }
        this.#entries.delete(key);
        removed++;
      }
    }
  }

  destroy(): void {
    if (this.#cleanup) {
      clearInterval(this.#cleanup);
      this.#cleanup = null;
    }
    this.#entries.clear();
  }
}

function defaultKeyExtractor(c: Context): string {
  return c.req.header('x-real-ip') ?? 'unknown';
}

/**
 * Create a rate limiting middleware using the sliding window counter algorithm.
 *
 * Sets standard rate limit headers on every response:
 * - `X-RateLimit-Limit` — max requests per window
 * - `X-RateLimit-Remaining` — requests left in current window
 * - `X-RateLimit-Reset` — Unix timestamp (seconds) when the window resets
 * - `Retry-After` — seconds until retry (only on 429)
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const { window: windowSec, max, message = 'Too many requests' } = options;
  const keyFn = options.key ?? defaultKeyExtractor;
  const cleanupInterval = options.cleanupInterval ?? 60_000;
  const maxKeys = options.maxKeys ?? 10_000;
  const windowMs = windowSec * 1000;

  const store = new RateLimitStore(windowMs, max, cleanupInterval, maxKeys);

  return async (c: Context, next: () => Promise<void>) => {
    const key = keyFn(c);
    const { allowed, current, resetAt } = store.check(key);
    const remaining = Math.max(0, max - current);
    const resetSec = Math.ceil(resetAt / 1000);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetSec));

    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      c.header('Retry-After', String(Math.max(1, retryAfter)));
      return c.json(
        {
          error: message,
        },
        429
      );
    }

    await next();
  };
}
