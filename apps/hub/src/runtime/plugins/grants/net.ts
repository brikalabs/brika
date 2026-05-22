/**
 * Hub-side handler for the `net.fetch` grant.
 *
 * Plugins call `ctx.net.fetch({...})`; the hub performs the actual request
 * here, enforces the host allow-list from the granted scope, and applies
 * the caller's timeout / retry / single-flight policy. Returns a serialized
 * response plus the attempt count.
 *
 * Closes findings N1 (no chokepoint), N2 (missing timeout), N3 (POST retry
 * without idempotency key), N4 (no Retry-After), N7 (no abort thread) from
 * the original audit — they collapse into one well-tested handler.
 */

import { BrikaError } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import { type FetchArgs, type NetScope, netFetch as spec } from '@brika/sdk/grants';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Match a host against a pattern: literal or one-level `*.suffix` wildcard.
 * Both sides are lower-cased — DNS is case-insensitive (RFC 4343), and
 * `URL.hostname` already lower-cases; we mirror that for the pattern so an
 * operator typing `Api.Example.com` in the allow-list still works.
 */
export function matchesHostPattern(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p === h) {
    return true;
  }
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    // `*.googleapis.com` matches `foo.googleapis.com` but NOT the bare
    // `googleapis.com` (which must be allow-listed explicitly).
    return h.endsWith(`.${suffix}`);
  }
  return false;
}

export function isHostAllowed(host: string, allow: ReadonlyArray<string>): boolean {
  for (const pattern of allow) {
    if (matchesHostPattern(host, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a Retry-After header (RFC 7231): delta-seconds OR HTTP-date.
 * Returns the delay in milliseconds clamped to [0, maxMs], or null on
 * unparseable input.
 *
 * Returning null on garbage matters: a hostile server sending
 * `Retry-After: garbage` must not trigger a 0ms fast-spin retry loop.
 * The caller falls back to the exponential backoff in that case.
 */
export function parseRetryAfter(value: string | null | undefined, maxMs: number): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxMs);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), maxMs);
  }
  return null;
}

/** Jitter a delay by ±25% to avoid thundering herds across coalesced clients. */
function jitter(ms: number): number {
  const factor = 0.75 + Math.random() * 0.5;
  return Math.round(ms * factor);
}

export interface NetCallbacks {
  /** Wired to `globalThis.fetch` in production; tests inject a mock. */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface FetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  attempts: number;
}

/**
 * Stable key for single-flight coalescing of GET/HEAD. HTTP header names
 * are case-insensitive (RFC 7230 §3.2), so we lowercase before sorting.
 */
function singleFlightKey(args: FetchArgs): string {
  const headerEntries = Object.entries(args.headers ?? {})
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${args.method}:${args.url}:${JSON.stringify(headerEntries)}`;
}

/**
 * Decide whether to retry given the latest response. Returns delay before
 * the next attempt, or null to stop.
 */
function shouldRetry(
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
  if (NON_IDEMPOTENT_METHODS.has(args.method) && !args.idempotencyKey) {
    return null;
  }
  const baseBackoff = Math.min(retry.backoffMs * 2 ** attemptIdx, MAX_BACKOFF_MS);
  if (res) {
    if (!RETRYABLE_STATUS.has(res.status)) {
      return null;
    }
    if (retry.respectRetryAfter) {
      const headerValue = res.headers.get('Retry-After');
      const headerDelay = parseRetryAfter(headerValue, MAX_BACKOFF_MS);
      if (headerDelay !== null) {
        return headerDelay;
      }
      // Header was missing or unparseable — fall through to the
      // exponential backoff below. Critical so a hostile server can't
      // induce a fast-spin retry loop with `Retry-After: garbage`.
    }
    return jitter(baseBackoff);
  }
  if (err !== undefined) {
    return jitter(baseBackoff);
  }
  return null;
}

/**
 * Sleep that races against an AbortSignal — important for retry backoff.
 * Without this, a plugin shutdown while a 30s backoff is pending would
 * have to wait the full delay before the abort takes effect.
 */
async function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
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

async function performFetch(
  cb: NetCallbacks,
  args: FetchArgs,
  parentSignal: AbortSignal
): Promise<FetchResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = args.retry?.maxAttempts ?? 1;
  const baseHeaders: Record<string, string> = { ...args.headers };
  if (args.idempotencyKey) {
    baseHeaders['Idempotency-Key'] = args.idempotencyKey;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // `AbortSignal.any` plus `AbortSignal.timeout` fans out cleanly: the
    // composed signal is GC'd with the dispatch (no listener pile-up on
    // the long-lived `parentSignal` under high concurrency), and the
    // per-attempt timeout signal is auto-managed by the runtime.
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(timeoutMs)]);
    try {
      const res = await cb.fetch(args.url, {
        method: args.method,
        headers: baseHeaders,
        body: args.body,
        signal,
      });
      const delay = shouldRetry(res, undefined, attempt, args);
      if (delay === null) {
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          status: res.status,
          statusText: res.statusText,
          headers,
          body: await res.text(),
          attempts: attempt + 1,
        };
      }
      // Discard the response body so we don't leak the connection.
      await res.text().catch(() => undefined);
      await abortableSleep(delay, parentSignal);
    } catch (e) {
      lastError = e;
      const delay = shouldRetry(null, e, attempt, args);
      if (delay === null) {
        throw e;
      }
      await abortableSleep(delay, parentSignal);
    }
  }
  throw lastError ?? new Error('net.fetch: retry attempts exhausted');
}

/**
 * Build the net handler. The single-flight cache lives in the closure so
 * every plugin gets its own coalescing scope — two plugins can't read each
 * other's pending GETs.
 */
export function buildNetGrants(cb: NetCallbacks) {
  const inFlight = new Map<string, Promise<FetchResult>>();

  return [
    defineGrant(spec.spec, (ctx, args) => {
      const scope: NetScope = ctx.grantedScope;
      // Use .hostname (excludes port) — allow-list patterns are bare host
      // names. `.host` would include `:8443` and silently 403 every non-
      // default port.
      const host = new URL(args.url).hostname;
      if (!isHostAllowed(host, scope.allow)) {
        throw new BrikaError(
          'PERMISSION_DENIED',
          `net.fetch: host "${host}" is not in this plugin's allow list (${scope.allow.join(', ') || '(empty)'})`,
          { data: { host, allow: scope.allow } }
        );
      }

      const canCoalesce =
        (args.method === 'GET' || args.method === 'HEAD') && args.singleFlight !== false;

      if (!canCoalesce) {
        return performFetch(cb, args, ctx.signal);
      }

      const key = singleFlightKey(args);
      const existing = inFlight.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const promise = performFetch(cb, args, ctx.signal).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    }),
  ];
}
