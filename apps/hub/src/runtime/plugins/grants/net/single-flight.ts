/**
 * Single-flight coalescing of identical GET/HEAD requests.
 *
 * Two plugin code paths firing the same GET at the same moment share one
 * upstream call; the second caller gets the first caller's response. Cuts
 * load on the remote side and our own connection pool, with no semantic
 * change for the plugin (GET/HEAD are by definition idempotent — RFC 7231
 * §4.2.2).
 *
 * The cache lives per `NetGrantFactory` closure, so two plugins never
 * coalesce against each other — that would be a privilege-mixing bug,
 * where plugin A might receive a response that contained data its scope
 * doesn't include.
 */

import type { FetchArgs } from '@brika/sdk/grants';
import type { FetchResult } from './types';

/**
 * Stable key for coalescing. HTTP headers are case-insensitive (RFC 7230
 * §3.2), so we lower-case before sorting — two callers that pass
 * `Authorization` vs. `authorization` should coalesce.
 *
 * `body` is intentionally NOT keyed: the SDK schema rejects bodies on
 * GET/HEAD, so two coalescing requests can't disagree on body.
 */
export function singleFlightKey(args: FetchArgs): string {
  const headerEntries = Object.entries(args.headers ?? {})
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${args.method}:${args.url}:${JSON.stringify(headerEntries)}`;
}

/** Closure-scoped coalescing map. Each plugin gets one. */
export class SingleFlightCache {
  readonly #inFlight = new Map<string, Promise<FetchResult>>();

  /**
   * Run `factory()` under the cache. If another caller registered the same
   * key first, returns that pending promise. Otherwise registers and
   * deletes on settle (success or failure — failures must not be cached,
   * or one timeout poisons every subsequent caller).
   */
  run(key: string, factory: () => Promise<FetchResult>): Promise<FetchResult> {
    const existing = this.#inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const promise = factory().finally(() => {
      this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, promise);
    return promise;
  }

  /** Test hook — size of the current in-flight set. */
  size(): number {
    return this.#inFlight.size;
  }
}
