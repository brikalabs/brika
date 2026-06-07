/**
 * Connectivity classification for caught network errors.
 *
 * Bun/Node surface the OS errno on `err.code` or, for fetch failures, on
 * `err.cause.code`; an `AbortSignal.timeout()` abort surfaces as a
 * `TimeoutError`. Mapping those to a small, typed kind lets callers turn a raw
 * fetch rejection into an actionable message ("you appear offline") instead of
 * a stack trace, and decide whether a retry/cache/local-fallback makes sense.
 */

export type NetworkErrorKind = 'offline' | 'unreachable' | 'timeout';

/** Pull the errno-style `code` off an error or its `cause`, if present. */
function networkCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  if ('code' in err && typeof err.code === 'string') {
    return err.code;
  }
  if (
    'cause' in err &&
    typeof err.cause === 'object' &&
    err.cause !== null &&
    'code' in err.cause
  ) {
    const causeCode = err.cause.code;
    return typeof causeCode === 'string' ? causeCode : undefined;
  }
  return undefined;
}

/**
 * Classify a caught error as a connectivity failure, or null when it is not one
 * (so the caller does not mask an unrelated error as "offline").
 *   - offline: DNS could not resolve (no internet / captive portal)
 *   - unreachable: the host refused or dropped the connection
 *   - timeout: the request (or an AbortSignal.timeout) elapsed
 */
export function classifyNetworkError(err: unknown): NetworkErrorKind | null {
  if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'TimeoutError') {
    return 'timeout';
  }
  switch (networkCode(err)) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'offline';
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return 'unreachable';
    case 'ETIMEDOUT':
      return 'timeout';
    default:
      return null;
  }
}
