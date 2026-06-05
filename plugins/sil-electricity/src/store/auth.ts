/**
 * Credentials, session cookie, and a deduplicated `authenticate()` so that
 * concurrent pollers don't trigger parallel logins on the SIL portal.
 */

import { log } from '@brika/sdk/lifecycle';
import { RateLimitError, silLogin } from '../api';
import { setAuthed } from './store';

interface Credentials {
  email: string;
  password: string;
}

/**
 * After the portal serves a CAPTCHA (rate-limit), wait this long before trying
 * to log in again. Retrying sooner just keeps the block alive, since the portal
 * counts every attempt. One attempt per cooldown is gentle enough for the block
 * to expire on SIL's side: 15 min is well above the storm cadence that triggered
 * the CAPTCHA, while still recovering within a reasonable window.
 */
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Any other login failure (wrong credentials, handshake hiccup, transient
 * network) backs off too, growing exponentially from BASE up to MAX. Hammering
 * the login every poll is exactly what escalates SIL into serving a CAPTCHA, so
 * even a "wrong password" stops retrying tightly.
 */
const AUTH_BACKOFF_BASE_MS = 60 * 1000;
const AUTH_BACKOFF_MAX_MS = 15 * 60 * 1000;

type CooldownReason = 'auth' | 'rateLimited';

let credentials: Credentials | null = null;
let sessionCookie = '';
let authInFlight: Promise<boolean> | null = null;
let cooldownUntil = 0;
let cooldownReason: CooldownReason = 'auth';
let consecutiveFailures = 0;

export function getSessionCookie(): string {
  return sessionCookie;
}

export function clearSession(): void {
  sessionCookie = '';
}

/** True while we are backing off (after a CAPTCHA or any login failure). */
export function isInCooldown(): boolean {
  return Date.now() < cooldownUntil;
}

/** Why we last failed: drives which message the brick shows. */
export function getCooldownReason(): CooldownReason {
  return cooldownReason;
}

/** Seconds until the next login attempt is allowed (0 when not backing off). */
export function cooldownRemainingSec(): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

export function getCredentials(): Credentials | null {
  return credentials;
}

/**
 * Set credentials. Returns `true` if they changed (caller should re-poll).
 * Passing empty values clears credentials and the session.
 */
export function updateCredentials(email: string, password: string): boolean {
  const next = email && password ? { email, password } : null;
  const changed = credentials?.email !== next?.email || credentials?.password !== next?.password;
  credentials = next;
  if (!credentials || changed) {
    sessionCookie = '';
    // New credentials are the user's signal to try again now, so drop any
    // active cooldown and reset the failure streak.
    cooldownUntil = 0;
    consecutiveFailures = 0;
    log.info('SIL credentials updated; cleared session and cooldown');
  }
  return changed;
}

/**
 * Record a login failure and arm the appropriate backoff. A CAPTCHA gets the
 * fixed rate-limit cooldown; anything else gets exponential backoff with jitter
 * so concurrent periods do not all retry in lockstep.
 */
function registerFailure(err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  if (err instanceof RateLimitError) {
    cooldownReason = 'rateLimited';
    cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    consecutiveFailures = 0;
    log.warn('SIL login rate-limited by CAPTCHA; backing off', {
      minutes: RATE_LIMIT_COOLDOWN_MS / 60000,
      detail,
    });
    return;
  }
  consecutiveFailures += 1;
  const base = Math.min(AUTH_BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1), AUTH_BACKOFF_MAX_MS);
  // +0-20% jitter so concurrent failures don't retry in lockstep. Uses the
  // crypto RNG (not Math.random) purely to keep static scanners quiet; the
  // value gates nothing security-sensitive, it only spreads a retry delay.
  const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const backoff = base + Math.floor(base * 0.2 * jitter);
  cooldownReason = 'auth';
  cooldownUntil = Date.now() + backoff;
  log.error('SIL login failed; backing off', {
    attempt: consecutiveFailures,
    retryInSec: Math.ceil(backoff / 1000),
    detail,
  });
}

/**
 * Log in if needed. Concurrent callers share the same in-flight promise
 * so the SIL portal sees only one login attempt at a time.
 */
export async function authenticate(): Promise<boolean> {
  if (!credentials) {
    return false;
  }
  if (sessionCookie) {
    return true;
  }
  if (isInCooldown()) {
    // Backing off; do not touch the portal until the cooldown expires, otherwise
    // we keep the block alive (CAPTCHA) or escalate it.
    log.debug('SIL auth skipped: backing off', {
      reason: cooldownReason,
      retryInSec: cooldownRemainingSec(),
    });
    return false;
  }
  if (authInFlight) {
    return authInFlight;
  }

  const creds = credentials;
  authInFlight = (async () => {
    const startedAt = Date.now();
    log.debug('SIL login attempt', { email: creds.email });
    try {
      sessionCookie = await silLogin(creds.email, creds.password, (msg, meta) =>
        log.debug(msg, meta)
      );
      const ok = sessionCookie.length > 0;
      setAuthed(ok);
      if (ok) {
        consecutiveFailures = 0;
        cooldownUntil = 0;
        log.info('SIL login OK', {
          cookies: sessionCookie.split('; ').length,
          ms: Date.now() - startedAt,
        });
      }
      return ok;
    } catch (err) {
      sessionCookie = '';
      setAuthed(false);
      registerFailure(err);
      return false;
    } finally {
      authInFlight = null;
    }
  })();
  return authInFlight;
}
