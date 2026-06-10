/**
 * Process-tree teardown. Bring down a child AND every descendant of
 * it. Three layers, each a fallback for the next:
 *
 *   1. Walk the live PID tree via `pgrep -P` BEFORE signalling anything.
 *      Once the group kill lands, descendants that re-`setpgid`'d
 *      themselves out of our group get reparented to init the instant
 *      their parent dies, and `pgrep -P` can no longer reach them. The
 *      snapshot has to come first.
 *   2. `kill(-pgid, signal)`: fast, atomic, reaches everyone IF the
 *      descendants stayed in the process group we created with
 *      `detached: true`.
 *   3. Signal each snapshotted PID individually (children first). This
 *      catches descendants that escaped the group (vite under some node
 *      wrappers does this).
 *
 * Silently swallows ESRCH/EPERM: a kill that fails because the
 * process is already gone is the goal.
 */

import type { Subprocess } from 'bun';
import { collectPidTree } from './port-detect';

export async function killTree(
  proc: Subprocess | null,
  signal: 'SIGTERM' | 'SIGKILL'
): Promise<void> {
  if (proc?.exitCode !== null || !proc.pid) {
    return;
  }
  await killPidTree(proc.pid, signal);
  // Belt-and-braces on the immediate child.
  try {
    proc.kill(signal);
  } catch {
    /* already dead */
  }
}

/**
 * Raw-PID variant of {@link killTree} for processes we didn't spawn in
 * this mortar session (stale children recorded by a previous run's
 * state file). Same snapshot-then-group-then-individual sequence.
 */
export async function killPidTree(pid: number, signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
  // 1. snapshot the tree while the parent chain is still alive
  let pids: number[] = [pid];
  try {
    pids = await collectPidTree(pid);
  } catch {
    /* pgrep unavailable or process already gone */
  }
  // 2. group kill
  safeKill(-pid, signal);
  // 3. individual kills, children first. Reverse a copy so we don't
  // mutate the array returned by `collectPidTree` (some callers may
  // keep a reference).
  const childrenFirst = [...pids].reverse();
  for (const p of childrenFirst) {
    safeKill(p, signal);
  }
}

function safeKill(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(pid, signal);
  } catch {
    /* ESRCH / EPERM, best-effort */
  }
}
