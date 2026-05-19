/**
 * Wrap an async function so that overlapping calls share a single in-flight
 * promise — i.e. a coalescing "first-caller wins" guard.
 *
 * Once the underlying call settles (resolve OR reject), the cache clears and
 * the next caller starts a fresh invocation. This is the right primitive for
 * "if a refresh is already in flight, await it instead of starting a second
 * one with stale inputs" — most notably OAuth refresh-token rotation where a
 * second concurrent POST returns invalid_grant.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) {
      return inFlight;
    }
    inFlight = fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
