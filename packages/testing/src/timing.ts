/**
 * Shared timing helpers for async tests.
 *
 * `flush()` (no args) yields ~10ms — enough for a typical
 * `useEffect → fetcher → setState → re-render` chain to land plus an
 * ink key-event roundtrip on a slow CI runner. Tuned to be the
 * smallest delay that doesn't flake on a 2-vCPU GitHub runner.
 * Pass an explicit `flush(ms)` only when the production code relies
 * on a longer real timer firing (debounce, animation, interval) and
 * there's no observable predicate worth polling.
 *
 * `waitFor(predicate)` polls every 10ms until the predicate returns
 * true or `timeoutMs` (default 2000) elapses. Returns silently on
 * timeout — the following `expect()` surfaces the failure with a
 * useful message. Prefer this over `flush(ms)` whenever the test
 * is asserting that *something happened* — it short-circuits as
 * soon as the state lands.
 */

const DEFAULT_FLUSH_MS = 25;

export function flush(ms: number = DEFAULT_FLUSH_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
