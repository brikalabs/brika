/**
 * Time / abort utilities shared across health and port-detect. Kept in
 * one place so we have one well-tested sleep + deadline implementation
 * instead of duplicated copies.
 */

/**
 * Promise that resolves after `ms` or rejects when `signal` aborts.
 * Cleans up the timer + listener regardless of which side wins.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Repeatedly invoke `attempt` until it resolves successfully or the
 * deadline elapses. Each failure is held as `lastError` and included
 * in the final timeout message.
 *
 * The caller decides what "success" means by returning the result.
 * `null` / `undefined` are treated as legitimate successes — use
 * exceptions to signal "try again."
 */
export async function pollUntil<T>(
  attempt: () => Promise<T>,
  options: {
    readonly timeoutMs: number;
    readonly intervalMs: number;
    readonly signal?: AbortSignal;
    readonly errorMessage: (lastError: unknown) => string;
  }
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new AbortedError();
    }
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
    }
    await sleep(options.intervalMs, options.signal);
  }
  throw new Error(options.errorMessage(lastError));
}

/** Sentinel — thrown by `sleep` / `pollUntil` when the abort signal trips. */
export class AbortedError extends Error {
  override readonly name = 'AbortedError';
  constructor() {
    super('aborted');
  }
}
