/**
 * Single-flight (request coalescing) primitive.
 *
 * Wraps a function so concurrent invocations share a single in-flight
 * Promise. The first caller starts the work; everyone else awaits the
 * same Promise; once it settles the slot is cleared and the next call
 * starts fresh. Both success and failure are shared by all coalesced
 * callers.
 *
 * Used by the OAuth client to dedupe concurrent refresh attempts —
 * providers that rotate refresh tokens (Spotify, Google, Microsoft)
 * accept the first POST and return `invalid_grant` to every concurrent
 * sibling, clobbering the freshly-stored token.
 *
 * ```ts
 * const refreshOnce = singleFlight(refreshToken);
 * await Promise.all([refreshOnce(), refreshOnce(), refreshOnce()]);
 * // → ONE network round-trip; all three resolve with the same token.
 * ```
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined;
  return () => {
    if (inflight) {
      return inflight;
    }
    inflight = fn().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}
