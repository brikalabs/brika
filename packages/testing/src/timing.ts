/**
 * Shared timing helpers for async tests.
 *
 * `sleep(ms)` is the unconditional pause — reach for it only when the
 * point of the test is to assert that *nothing* happens within a window.
 * For positive assertions, prefer `waitFor()` so the test short-circuits.
 *
 * `flush(ms)` (no args) yields ~25ms — enough for a typical
 * `useEffect → fetcher → setState → re-render` chain to land plus an
 * ink key-event roundtrip on a slow CI runner. Tuned to be the
 * smallest delay that doesn't flake on a 2-vCPU GitHub runner.
 * Pass an explicit `flush(ms)` only when the production code relies
 * on a longer real timer firing (debounce, animation, interval).
 *
 * `waitFor(predicate, options?)` polls every `intervalMs` (default 10)
 * until the predicate returns true or `timeoutMs` (default 2000) elapses.
 * On timeout it **throws** so the test fails with a useful message
 * instead of the silent return that older revisions of this helper used.
 * The second argument can be a plain `number` (treated as `timeoutMs`)
 * for backward compatibility with the older API.
 */

const DEFAULT_FLUSH_MS = 25;
const DEFAULT_WAIT_TIMEOUT_MS = 2000;
const DEFAULT_WAIT_INTERVAL_MS = 10;

export type WaitForOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  message?: string;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function flush(ms: number = DEFAULT_FLUSH_MS): Promise<void> {
  return sleep(ms);
}

export async function waitFor(
  predicate: () => boolean,
  optionsOrTimeoutMs?: number | WaitForOptions
): Promise<void> {
  const options: WaitForOptions =
    typeof optionsOrTimeoutMs === 'number'
      ? { timeoutMs: optionsOrTimeoutMs }
      : (optionsOrTimeoutMs ?? {});
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  if (predicate()) {
    return;
  }
  throw new Error(
    options.message ?? `waitFor: predicate did not become true within ${timeoutMs}ms`
  );
}
