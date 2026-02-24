import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from './runtime';

export const PID_FILE = join(dataDir, 'brika.pid');

export type PidStatus =
  | { state: 'running'; pid: number }
  | { state: 'stale'; pid: number }
  | { state: 'stopped' };

/** Read the PID from the .brika/brika.pid file. Returns null if missing or invalid. */
export async function readPid(): Promise<number | null> {
  const raw = await readFile(PID_FILE, 'utf8').catch(() => null);
  if (raw === null) return null;
  const pid = Number.parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
}

/** Check whether the hub process is running, stale, or stopped. */
export async function checkPid(): Promise<PidStatus> {
  const pid = await readPid();
  if (pid === null) return { state: 'stopped' };
  try {
    process.kill(pid, 0);
    return { state: 'running', pid };
  } catch (e) {
    if (isErrnoException(e) && e.code === 'ESRCH') return { state: 'stale', pid };
    return { state: 'running', pid }; // EPERM: alive but owned by another user
  }
}

/** Remove the PID file. */
export async function removePidFile(): Promise<void> {
  await rm(PID_FILE, { force: true });
}

/**
 * Claim the PID file for the current process.
 * Returns the PID of an already-running instance, or null if successfully claimed.
 */
export async function claimPidFile(): Promise<number | null> {
  const status = await checkPid();
  if (status.state === 'running') return status.pid;
  if (status.state === 'stale') await removePidFile();
  await mkdir(dataDir, { recursive: true });
  await writeFile(PID_FILE, String(process.pid), 'utf8');
  return null;
}

/** Type guard for Node.js errno exceptions. */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
