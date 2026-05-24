/**
 * Shared test helpers for the console suite.
 *
 * `flush()` (no args) is a microtask flush — it costs zero real wall-clock
 * time and is what you want for "let React commit the queued state update
 * and ink's renderer settle." Pass `flush(ms)` only when the production
 * code under test actually relies on a real timer firing (e.g. waiting
 * past a debounce or animation) — and even then prefer `waitFor()` over
 * a fixed sleep so the test short-circuits as soon as the state lands.
 */
export function flush(ms?: number): Promise<void> {
  if (ms !== undefined) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // The default `flush()` drains two macrotask cycles back-to-back. This
  // is enough for a `useEffect → fetcher → setState → re-render` chain
  // to land, plus an ink key-event roundtrip, without paying real
  // wall-clock for a fixed sleep. Tests that need a longer real-time
  // wait (a debounce, animation, or interval in source) must pass an
  // explicit `ms` — or better, use `waitFor()` so the assertion
  // short-circuits as soon as state lands.
  return new Promise<void>((resolve) => {
    setTimeout(() => setTimeout(resolve, 0), 0);
  });
}

/**
 * Poll `predicate` every 10ms until it returns true or `timeoutMs` elapses.
 * Returns silently on timeout — the following `expect()` is responsible
 * for surfacing the failure with a useful message.
 */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
