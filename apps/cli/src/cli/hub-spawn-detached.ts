/**
 * Spawn `brika hub` as a detached child for the TUI's start action.
 * The TUI doesn't supervise the hub once it's up — the PID file does
 * the cross-process bookkeeping, and the TUI polls it. If the user
 * quits the TUI, the hub keeps running until they hit `x` to stop or
 * exit it through some other channel.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors';

function findOwnEntry(): string {
  // Walk up from this file looking for apps/cli/src/main.ts.
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'main.ts');
    if (existsSync(candidate)) {
      return candidate;
    }
    const cliCandidate = join(dir, 'apps', 'cli', 'src', 'main.ts');
    if (existsSync(cliCandidate)) {
      return cliCandidate;
    }
    dir = dirname(dir);
  }
  throw new CliError("Couldn't locate brika's own entry point.");
}

/**
 * Detached `brika hub`. Returns the spawned PID so the caller can
 * surface it in the UI; the child runs independently from then on.
 */
export function spawnHubDetached(): number {
  const entry = findOwnEntry();
  const child = Bun.spawn([process.execPath, entry, 'hub'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  child.unref();
  return child.pid;
}
