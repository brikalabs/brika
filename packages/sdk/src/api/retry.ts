/**
 * Bounded retry with exponential backoff, for flaky side effects inside
 * blocks (HTTP calls, device commands, tool invocations).
 *
 * ```ts
 * const res = await retry(() => fetch(url), { attempts: 3, backoffMs: 250 });
 * ```
 */

export interface RetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Delay before the first retry, in milliseconds (default 250). */
  backoffMs?: number;
  /** Multiplier applied to the delay after each retry (default 2). */
  factor?: number;
  /** Return false to stop retrying for an error (default: retry everything). */
  shouldRetry?: (error: unknown) => boolean;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` until it resolves, retrying up to `attempts` times with
 * exponential backoff. The attempt number (1-based) is passed to `fn`.
 * The last error is rethrown when every attempt fails.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T> | T,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const factor = options.factor ?? 2;
  let delay = options.backoffMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retriable = options.shouldRetry?.(error) ?? true;
      if (!retriable || attempt === attempts) {
        throw error;
      }
      await wait(delay);
      delay *= factor;
    }
  }

  // Unreachable: the loop either returns or throws on the last attempt.
  throw lastError;
}
