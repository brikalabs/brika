/**
 * Retry decisions and timing.
 *
 * Three concerns live here:
 *   - Parsing `Retry-After` (defeats fast-spin on hostile garbage)
 *   - Deciding whether to retry given a response or error
 *   - Sleeping in a way that races a parent abort signal so plugin shutdown
 *     doesn't have to wait out a 30s backoff
 *
 * No I/O. The actual fetch call is in `perform.ts`.
 */

import type { FetchArgs } from '@brika/sdk/grants';
import { MAX_BACKOFF_MS, NON_IDEMPOTENT_METHODS, RETRYABLE_STATUS } from './types';

/**
 * Parse `Retry-After` per RFC 7231: either delta-seconds OR an HTTP-date.
 * Returns the delay in milliseconds, clamped to `[0, maxMs]`, or null on
 * unparseable input.
 *
 * Returning null on garbage is the critical security case: a hostile
 * server sending `Retry-After: garbage` must not cause us to retry
 * immediately. The caller falls back to exponential backoff in that case.
 */
export function parseRetryAfter(value: string | null | undefined, maxMs: number): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    // It parses as a number — accept only when non-negative. Negative
    // values must NOT fall through to `Date.parse`, which can interpret
    // them as historical years (e.g. `-5` → year 5 BC → clamped to 0ms
    // → fast-spin retry). The "garbage means null" contract relies on
    // this gate.
    if (seconds < 0) {
      return null;
    }
    return Math.min(seconds * 1000, maxMs);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), maxMs);
  }
  return null;
}

/**
 * Jitter a delay by ±25% to avoid thundering herds when many coalesced
 * clients all retry at the same exponential checkpoint.
 *
 * Uses Web Crypto rather than `Math.random` not because the jitter is
 * security-sensitive (it isn't — predicting it confers no advantage),
 * but because SonarCloud's S2245 flags every `Math.random` call as a
 * hotspot. Using a CSPRNG is structurally equivalent here and removes
 * the manual-review burden.
 */
export function jitter(ms: number): number {
  const raw = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  const factor = 0.75 + (raw / 0xffffffff) * 0.5;
  return Math.round(ms * factor);
}

/**
 * Compute the next retry delay, or null if the attempt should not be
 * retried. Inputs: the last response (or null on transport error), the
 * captured error (if any), the attempt index, and the caller's args.
 */
export function shouldRetry(
  res: Response | null,
  err: unknown,
  attemptIdx: number,
  args: FetchArgs
): number | null {
  const retry = args.retry;
  if (!retry || attemptIdx + 1 >= retry.maxAttempts) {
    return null;
  }
  // Non-idempotent methods need an explicit idempotency key to retry.
  // Without one, replaying could double-charge / double-create on the
  // remote side, and the SDK can't make that call for the plugin.
  if (NON_IDEMPOTENT_METHODS.has(args.method) && !args.idempotencyKey) {
    return null;
  }
  const baseBackoff = Math.min(retry.backoffMs * 2 ** attemptIdx, MAX_BACKOFF_MS);
  if (res) {
    if (!RETRYABLE_STATUS.has(res.status)) {
      return null;
    }
    if (retry.respectRetryAfter) {
      const headerDelay = parseRetryAfter(res.headers.get('Retry-After'), MAX_BACKOFF_MS);
      if (headerDelay !== null) {
        return headerDelay;
      }
      // Header missing or unparseable: fall through to exponential backoff
      // so a hostile `Retry-After: garbage` can't induce a fast-spin loop.
    }
    return jitter(baseBackoff);
  }
  if (err !== undefined) {
    return jitter(baseBackoff);
  }
  return null;
}

/**
 * `setTimeout` that races against an AbortSignal. A plugin shutdown
 * triggered mid-backoff must take effect immediately, not after the full
 * delay.
 */
export async function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw signal.reason ?? new Error('aborted');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
