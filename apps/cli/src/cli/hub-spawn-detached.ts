/**
 * Spawn `brika hub` as a detached child for the TUI's start action.
 * The TUI doesn't supervise the hub once it's up — the PID file does
 * the cross-process bookkeeping, and the TUI polls it. If the user
 * quits the TUI, the hub keeps running until they hit `x` to stop or
 * exit it through some other channel.
 *
 * Race handling: if multiple TUIs hit "start" simultaneously, only
 * one supervisor wins `claimPidFile()` — the rest exit non-zero
 * almost immediately. `spawnHubDetached` waits briefly to see which
 * happened and returns the *winner's* PID either way, so every
 * caller converges on the same "hub running, pid N" story without
 * spurious "couldn't spawn" errors.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors';
import { hubUrl } from './hub-client';
import { checkPid } from './pid';

/** How long to wait for the spawned child to claim the PID file. */
const SETTLE_TIMEOUT_MS = 1500;
/** How often to re-check the PID file while waiting. */
const POLL_INTERVAL_MS = 50;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Quick `connect()`-style probe: does anything answer on the hub's
 * configured port? We don't care about the response shape — `fetch`
 * resolving (or 4xx-ing) means the port is taken; a `connect`
 * failure (ECONNREFUSED) means it's free.
 *
 * Used to distinguish "fresh start, port free" from "port already
 * held by a foreign process that didn't write our PID file" so the
 * TUI can surface a specific, actionable error.
 */
async function portInUse(): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/health', hubUrl()), {
      signal: AbortSignal.timeout(500),
    });
    // Any HTTP response means *something* is listening.
    return res.status >= 0;
  } catch {
    return false;
  }
}

/**
 * Detached `brika hub`. Returns the PID of the running supervisor —
 * which may be a hub started by a concurrent TUI rather than the
 * child this call forked. The child runs independently either way.
 */
export async function spawnHubDetached(): Promise<number> {
  // Pre-check: cheap path when a hub is already running. Skips the
  // fork + supervisor self-eviction round-trip entirely.
  const existing = await checkPid();
  if (existing.state === 'running') {
    return existing.pid;
  }

  // The port is held by something we don't manage (a `bun --watch
  // src/main.ts` from a separate shell, a stale process, an unrelated
  // service). Spawning would EADDRINUSE-loop silently — surface the
  // collision now so the user can free the port.
  if (await portInUse()) {
    throw new CliError(
      `port ${new URL(hubUrl()).port} is already in use by a process we don't manage. ` +
        `Free it (e.g. \`lsof -nP -iTCP -sTCP:LISTEN\`) and try again.`
    );
  }

  const entry = findOwnEntry();
  const child = Bun.spawn([process.execPath, entry, 'hub'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  child.unref();

  // Wait until either (a) the PID file shows a running hub, or
  // (b) our child exits — meaning another supervisor already had
  // the PID file claimed and our child bailed out.
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (typeof child.exitCode === 'number') {
      const winner = await checkPid();
      if (winner.state === 'running') {
        return winner.pid;
      }
      throw new CliError('hub exited before claiming the PID file');
    }
    const status = await checkPid();
    if (status.state === 'running') {
      return status.pid;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout — child is still alive but hasn't claimed the PID file
  // yet. Surface its PID; the TUI's poll loop will reconcile shortly.
  return child.pid;
}
