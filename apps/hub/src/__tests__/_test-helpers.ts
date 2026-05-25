/**
 * Shared timing helpers for hub tests.
 *
 * `waitFor(predicate)` short-circuits as soon as the condition lands,
 * replacing fixed-duration `setTimeout(resolve, N)` sleeps that previously
 * padded the worst-case wait. Use `flush()` to yield one or two microtask
 * turns and `sleep(ms)` only for genuine negative assertions where the
 * point is to confirm nothing happens within a window.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => setTimeout(resolve, 0), 0);
  });
}

export async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {}
): Promise<void> {
  const { timeoutMs = 2000, intervalMs = 10, message } = options;
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
  throw new Error(message ?? `waitFor: predicate did not become true within ${timeoutMs}ms`);
}
