/**
 * Local-trust CLI token. The supervisor writes a per-instance
 * random token to `${brikaDir}/cli-token` (mode 0600) when the hub
 * comes up; the CLI reads the same file and sends it as
 * `Authorization: Bearer …` so every `/api/*` call from the same
 * machine is authenticated as the admin principal without a login.
 *
 * Security model: equivalent to SSH / gh / docker — anyone who can
 * read the user's `${BRIKA_HOME}` is already the user. The file is
 * cleaned up alongside the PID file on supervisor exit.
 *
 * Counterpart on the CLI side: `apps/cli/src/cli/auth-token.ts`.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brikaContext } from '@/runtime/context/brika-context';

export const CLI_TOKEN_FILE = join(brikaContext.brikaDir, 'cli-token');

/** 32 random bytes → 64 hex chars. Same shape as a session token. */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Write a fresh token to `${brikaDir}/cli-token` with 0600 perms.
 * Returns the token so the caller can register it in the static
 * resolver.
 */
export function writeCliToken(): string {
  const token = generateToken();
  mkdirSync(brikaContext.brikaDir, { recursive: true });
  writeFileSync(CLI_TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 });
  // mode in writeFileSync only applies on file creation — re-apply
  // explicitly so a pre-existing token gets locked down too.
  try {
    chmodSync(CLI_TOKEN_FILE, 0o600);
  } catch {
    /* not all filesystems support chmod (e.g. Windows) */
  }
  return token;
}

/** Read the current token, or `null` if the file is missing or unreadable. */
export function readCliToken(): string | null {
  try {
    const raw = readFileSync(CLI_TOKEN_FILE, 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Remove the token file. Safe to call when it doesn't exist. */
export function removeCliToken(): void {
  rmSync(CLI_TOKEN_FILE, { force: true });
}
