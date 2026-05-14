/**
 * Lightweight PID-file checks for the CLI. Reads `.brika/brika.pid`
 * (or `$BRIKA_HOME/brika.pid`) and tests whether the recorded PID is
 * actually running.
 *
 * Mirrors `apps/hub/src/cli/utils/pid.ts` but without pulling in the
 * hub's runtime context. Path resolution lives in `./paths.ts`.
 */

import { readFile, rm } from 'node:fs/promises';
import { pidFile } from './paths';

export type PidStatus =
  | { state: 'running'; pid: number }
  | { state: 'stale'; pid: number }
  | { state: 'stopped' };

export async function readPid(): Promise<number | null> {
  const raw = await readFile(pidFile(), 'utf8').catch(() => null);
  if (raw === null) {
    return null;
  }
  const pid = Number.parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
}

export async function checkPid(): Promise<PidStatus> {
  const pid = await readPid();
  if (pid === null) {
    return { state: 'stopped' };
  }
  try {
    process.kill(pid, 0);
    return { state: 'running', pid };
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ESRCH') {
      return { state: 'stale', pid };
    }
    // EPERM: alive but owned by another user — still counts as running.
    return { state: 'running', pid };
  }
}

export async function removePidFile(): Promise<void> {
  await rm(pidFile(), { force: true });
}
