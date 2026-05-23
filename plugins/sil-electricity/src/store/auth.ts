/**
 * Credentials, session cookie, and a deduplicated `authenticate()` so that
 * concurrent pollers don't trigger parallel logins on the SIL portal.
 */

import { silLogin } from '../api';
import { log } from '../api/internals';
import { setAuthed } from './store';

interface Credentials {
  email: string;
  password: string;
}

let credentials: Credentials | null = null;
let sessionCookie = '';
let authInFlight: Promise<boolean> | null = null;

export function getSessionCookie(): string {
  return sessionCookie;
}

export function clearSession(): void {
  sessionCookie = '';
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
  }
  return changed;
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
  if (authInFlight) {
    return authInFlight;
  }

  const creds = credentials;
  authInFlight = (async () => {
    try {
      sessionCookie = await silLogin(creds.email, creds.password);
      const ok = sessionCookie.length > 0;
      setAuthed(ok);
      return ok;
    } catch (err) {
      log.error(`SIL login failed: ${err instanceof Error ? err.message : String(err)}`);
      sessionCookie = '';
      setAuthed(false);
      return false;
    } finally {
      authInFlight = null;
    }
  })();
  return authInFlight;
}
