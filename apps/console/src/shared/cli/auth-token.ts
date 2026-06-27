/**
 * Local-trust CLI token. Lives at `${BRIKA_HOME}/cli-token` (mode 0600).
 *
 * Both ends need this file:
 *   - The CLI's `brika hub` supervisor (this binary) writes a fresh
 *     random token after claiming the PID file and removes it on exit.
 *   - The hub binary reads it at boot and registers a static-token
 *     resolver so `Authorization: Bearer <token>` requests authenticate
 *     as the admin principal without a login.
 *   - The CLI's `hubFetch` reads it on every request and attaches it.
 *
 * Security model: same as SSH / gh / docker — anyone who can read the
 * user's `$BRIKA_HOME` is already the user.
 *
 * Counterpart on the hub side: `apps/hub/src/auth/cli-token.ts`.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { systemDir } from './paths';

function tokenPath(): string {
  return join(systemDir(), 'cli-token');
}

/** Read the current token, or `null` if the file is missing or unreadable. */
export function readCliToken(): string | null {
  try {
    const raw = readFileSync(tokenPath(), 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Write a fresh 64-hex-char token at 0600 perms. Returns the token. */
export function writeCliToken(): string {
  const token = randomBytes(32).toString('hex');
  const file = tokenPath();
  mkdirSync(systemDir(), { recursive: true });
  writeFileSync(file, token, { encoding: 'utf8', mode: 0o600 });
  // `mode` in writeFileSync only applies on creation; re-apply so a
  // pre-existing file gets locked down too.
  try {
    chmodSync(file, 0o600);
  } catch {
    /* filesystems without chmod (Windows) — acceptable */
  }
  return token;
}

/** Remove the token file. Safe to call when it doesn't exist. */
export function removeCliToken(): void {
  rmSync(tokenPath(), { force: true });
}
