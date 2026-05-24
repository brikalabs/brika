/**
 * Shared timing helpers for async tests.
 *
 * `flush()` (no args) drains two macrotask cycles back-to-back —
 * zero real wall-clock, enough for a typical
 * `useEffect → fetcher → setState → re-render` chain to land plus an
 * ink key-event roundtrip. Pass `flush(ms)` only when the production
 * code under test relies on a real timer firing (debounce, animation,
 * interval) and there's no observable predicate worth polling.
 *
 * `waitFor(predicate)` polls every 10ms until the predicate returns
 * true or `timeoutMs` (default 2000) elapses. Returns silently on
 * timeout — the following `expect()` surfaces the failure with a
 * useful message. Prefer this over `flush(ms)` whenever the test
 * is asserting that *something happened* — it short-circuits as
 * soon as the state lands.
 */

export function flush(ms?: number): Promise<void> {
  if (ms !== undefined) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  return new Promise<void>((resolve) => {
    setTimeout(() => setTimeout(resolve, 0), 0);
  });
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
