/**
 * Read the local-trust CLI token written by the hub supervisor to
 * `${BRIKA_HOME}/cli-token`. Returns `null` if the file is missing —
 * the hub is either not running, or running outside the supervisor
 * (in which case the user is on their own for auth).
 *
 * Counterpart on the hub side: `apps/hub/src/cli/utils/cli-token.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brikaHome } from './paths';

export function readCliToken(): string | null {
  try {
    const raw = readFileSync(join(brikaHome(), 'cli-token'), 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}
