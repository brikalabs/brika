/**
 * Process-tree teardown. Bring down a child AND every descendant of
 * it. Three layers, each a fallback for the next:
 *
 *   1. `kill(-pgid, signal)` — fast, atomic, reaches everyone IF the
 *      descendants stayed in the process group we created with
 *      `detached: true`.
 *   2. Walk the live PID tree via `pgrep -P` and signal each one. This
 *      catches descendants that re-`setpgid`'d themselves out of our
 *      group (vite under some node wrappers does this).
 *   3. Plain `proc.kill(signal)` on the immediate child — belt-and-braces.
 *
 * Silently swallows ESRCH/EPERM — a kill that fails because the
 * process is already gone is the goal.
 */

import type { Subprocess } from 'bun';
import { collectPidTree } from './port-detect';

export async function killTree(
  proc: Subprocess | null,
  signal: 'SIGTERM' | 'SIGKILL'
): Promise<void> {
  if (!proc || proc.exitCode !== null || !proc.pid) {
    return;
  }
  // 1. group kill
  safeKill(-proc.pid, signal);
  // 2. tree walk (descendants that escaped the group)
  try {
    const pids = await collectPidTree(proc.pid);
    for (const pid of pids.reverse()) {
      safeKill(pid, signal);
    }
  } catch {
    /* pgrep unavailable or process already gone */
  }
  // 3. direct
  try {
    proc.kill(signal);
  } catch {
    /* already dead */
  }
}

function safeKill(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(pid, signal);
  } catch {
    /* ESRCH / EPERM — best-effort */
  }
}
