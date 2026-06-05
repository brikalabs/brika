/**
 * Auth-failure sentinel for the SIL portal flow.
 *
 * Carries a human-readable `detail` (HTTP status, body snippet, or the step
 * that failed) so a failure is diagnosable from the log line alone, while
 * `instanceof` stays the stable signal pollers use to decide whether to
 * re-authenticate. String-matching the message, as the poller used to, breaks
 * the moment the message is enriched.
 */
export class AuthError extends Error {
  constructor(detail?: string) {
    super(detail ? `AUTH_FAILED: ${detail}` : 'AUTH_FAILED');
    this.name = 'AuthError';
  }
}

/**
 * Thrown when the SIL portal challenges the login with a CAPTCHA or otherwise
 * rate-limits us (HTTP 400 with a captcha / verification-code field). The
 * portal does this after too many login attempts in a short window. We cannot
 * solve a CAPTCHA, so the caller must back off for a cooldown instead of
 * retrying every poll, which would only keep the block alive. Extends
 * `AuthError` so existing `instanceof AuthError` checks still treat it as an
 * auth failure.
 */
export class RateLimitError extends AuthError {
  constructor(detail?: string) {
    super(detail);
    this.name = 'RateLimitError';
  }
}
