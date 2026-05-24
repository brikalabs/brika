/**
 * Shared test helpers for the brix suite.
 *
 * `flush()` (no args) costs zero real wall-clock time — it just drains
 * two macrotask cycles, which is enough for a typical
 * `useEffect → setState → re-render` chain to settle. Pass `flush(ms)`
 * only when the production code under test relies on a real timer
 * firing (animation frames, timeline ticks) — and even then prefer
 * `waitFor()` so the assertion short-circuits as soon as state lands.
 */
export function flush(ms?: number): Promise<void> {
  if (ms !== undefined) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
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
