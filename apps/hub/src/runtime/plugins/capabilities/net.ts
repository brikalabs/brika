/**
 * Hub-side handler for the `net.fetch` capability.
 *
 * Plugins call `ctx.net.fetch({...})`; the hub performs the actual request
 * here, enforces the host allowlist from the granted scope, and applies the
 * caller's timeout/retry/single-flight policy. Returns a serialized
 * response plus the attempt count the hub used.
 *
 * Closes findings N1 (no chokepoint), N2 (missing timeout), N3 (POST retry
 * without idempotency key), N4 (no Retry-After), N7 (no abort thread) from
 * the original audit — they collapse into one well-tested handler.
 */

import { defineCapability } from '@brika/capabilities';
import { netFetch as spec } from '@brika/sdk/capabilities';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Match a host against a pattern. Supports literals and one-level `*.` wildcards. */
export function matchesHostPattern(host: string, pattern: string): boolean {
  if (pattern === host) {
    return true;
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    // `*.googleapis.com` matches `foo.googleapis.com` but not the bare
    // `googleapis.com` (which would need to be allow-listed explicitly).
    return host.endsWith(`.${suffix}`);
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
 * Parse a Retry-After header (RFC 7231) — supports both delta-seconds and
 * HTTP-date forms. Returns the delay in milliseconds, clamped to [0, max].
 */
export function parseRetryAfter(value: string | null | undefined, maxMs: number): number {
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxMs);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), maxMs);
  }
  return 0;
}

/** Jitter a delay by ±25% to avoid thundering herds across coalesced clients. */
function jitter(ms: number): number {
  const factor = 0.75 + Math.random() * 0.5;
  return Math.round(ms * factor);
}

export interface NetCallbacks {
  /**
   * Perform an HTTP request. Wired to `globalThis.fetch` in production;
   * tests override with a mock.
   */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface NetScope {
  allow: ReadonlyArray<string>;
}

interface FetchArgs {
  url: string;
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  singleFlight?: boolean;
  idempotencyKey?: string;
  retry?: {
    maxAttempts: number;
    respectRetryAfter: boolean;
    backoffMs: number;
  };
}

interface FetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  attempts: number;
}

/**
 * Stable key for single-flight coalescing of GET/HEAD requests.
 *
 * HTTP header names are case-insensitive (RFC 7230 §3.2): two GETs with
 * `Accept-Language: en` and `accept-language: en` are semantically the
 * same request and must hit the same in-flight entry. We normalize keys
 * to lowercase before sorting so the key is canonical.
 */
function singleFlightKey(args: FetchArgs): string {
  const headerEntries = Object.entries(args.headers ?? {})
    .map(([k, v]) => [k.toLowerCase(), v] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  return `${args.method}:${args.url}:${JSON.stringify(headerEntries)}`;
}

/**
 * Decide whether to retry given the latest response and remaining attempts.
 * Returns the delay to wait before the next attempt, or null to stop.
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
      if (headerValue !== null) {
        // Honor whatever the upstream said — including 0 (retry now).
        return parseRetryAfter(headerValue, MAX_BACKOFF_MS);
      }
    }
    return jitter(baseBackoff);
  }
  // Network/abort errors are retryable too — same backoff.
  if (err !== undefined) {
    return jitter(baseBackoff);
  }
  return null;
}

async function performFetch(cb: NetCallbacks, args: FetchArgs): Promise<FetchResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = args.retry?.maxAttempts ?? 1;
  const baseHeaders: Record<string, string> = { ...args.headers };
  if (args.idempotencyKey) {
    baseHeaders['Idempotency-Key'] = args.idempotencyKey;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`net.fetch: timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    try {
      const res = await cb.fetch(args.url, {
        method: args.method,
        headers: baseHeaders,
        body: args.body,
        signal: controller.signal,
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
      await Bun.sleep(delay);
    } catch (e) {
      lastError = e;
      const delay = shouldRetry(null, e, attempt, args);
      if (delay === null) {
        throw e;
      }
      await Bun.sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  // Exhausted attempts without a returnable response.
  throw lastError ?? new Error('net.fetch: retry attempts exhausted');
}

/**
 * Build the net handler. The single-flight cache lives in the closure so
 * every plugin gets its own coalescing scope — two plugins can't read each
 * other's pending GETs.
 */
export function buildNetCapabilities(cb: NetCallbacks) {
  const inFlight = new Map<string, Promise<FetchResult>>();

  return [
    defineCapability(spec.spec, (ctx, raw) => {
      const args = raw as FetchArgs;
      const scope = ctx.grantedScope as NetScope;
      const host = new URL(args.url).host;
      if (!isHostAllowed(host, scope.allow)) {
        throw new Error(
          `net.fetch: host "${host}" is not in this plugin's allow list (${scope.allow.join(', ') || '(empty)'})`
        );
      }

      const canCoalesce =
        (args.method === 'GET' || args.method === 'HEAD') && args.singleFlight !== false;

      if (!canCoalesce) {
        return performFetch(cb, args);
      }

      const key = singleFlightKey(args);
      const existing = inFlight.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const promise = performFetch(cb, args).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    }),
  ];
}
