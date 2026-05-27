/**
 * Spawn the standalone supervisor as a detached child for the TUI's
 * start action. The supervisor (see `hub-supervisor-loop.ts`) keeps
 * the hub alive across exit-code-42 restarts — the signal the orches-
 * trator's `markRestartPending()` and `POST /api/system/restart` use
 * to ask for a respawn. Without it, `brika update` + the UI restart
 * button would kill the hub permanently on `brika start` installs.
 *
 * The hub child (one level deeper than the supervisor) still owns the
 * pid file, so `brika status` and `brika stop` paths are unchanged.
 * `brika stop` kills the hub → exit code 0 → supervisor exits cleanly
 * too. The supervisor pid is what we return here; if the operator
 * `kill`s that pid directly, signals are forwarded to the hub child.
 *
 * Race handling: if multiple TUIs hit "start" simultaneously, only
 * one wins `claimPidFile()` inside the hub — the rest exit non-zero
 * almost immediately. `spawnHubDetached` waits briefly to see which
 * happened and returns the *winner's* PID either way, so every
 * caller converges on the same "hub running, pid N" story without
 * spurious "couldn't spawn" errors.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors';
import { checkPid } from './pid';

/** How long to wait for the spawned child to claim the PID file. */
const SETTLE_TIMEOUT_MS = 1500;
/** How often to re-check the PID file while waiting. */
const POLL_INTERVAL_MS = 50;

/** `true` when this module is loaded from inside a `bun build --compile` binary. */
const IS_COMPILED = import.meta.path.startsWith('/$bunfs/');

/**
 * Build the argv used to re-invoke this binary as `brika hub`.
 *
 * In a compiled binary `process.execPath` *is* the brika executable
 * (the Bun runtime is baked in), so we hand Bun an empty entry and pass
 * `['hub']` as the user-visible args. In dev we still have to point Bun
 * at the source entry — we walk up from this file looking for
 * `apps/console/src/main.ts`. The compiled-mode bunfs path
 * (`/$bunfs/...`) has no on-disk ancestor, which is why the walk fails
 * there and we need the explicit branch.
 */
export function resolveSelfSpawnArgs(extraArgs: string[] = ['hub']): string[] {
  if (IS_COMPILED) {
    return [process.execPath, ...extraArgs];
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'main.ts');
    if (existsSync(candidate)) {
      return [process.execPath, candidate, ...extraArgs];
    }
    const consoleCandidate = join(dir, 'apps', 'console', 'src', 'main.ts');
    if (existsSync(consoleCandidate)) {
      return [process.execPath, consoleCandidate, ...extraArgs];
    }
    dir = dirname(dir);
  }
  throw new CliError("Couldn't locate brika's own entry point.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detached `brika hub`. Returns the PID of the running supervisor —
 * which may be a hub started by a concurrent TUI rather than the
 * child this call forked. The child runs independently either way.
 */
export async function spawnHubDetached(): Promise<number | null> {
  // Pre-check: cheap path when a hub is already running. `checkPid`
  // now also probes `/api/health`, so externally-started hubs (those
  // without a pid file) are detected here too — `pid` will be `null`
  // in that case and the TUI shows "running" without a pid badge.
  const existing = await checkPid();
  if (existing.state === 'running') {
    return existing.pid;
  }

  // `Bun.spawn` does NOT inherit the parent env by default — confirmed
  // empirically against Bun 1.3.13 (docs claim otherwise). We have to
  // forward it explicitly so the child sees BRIKA_HOME, BRIKA_PORT,
  // BRIKA_HOST and anything else the caller staged before spawning.
  //
  // We spawn `__supervisor` (not `hub`) so the hub respawns on
  // exit-code-42 — see the file header for the full rationale.
  const child = Bun.spawn(resolveSelfSpawnArgs(['__supervisor']), {
    env: process.env as Record<string, string>,
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
