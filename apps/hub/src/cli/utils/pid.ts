import { readFile, rm } from 'node:fs/promises';
export { PID_FILE } from '@/runtime/bootstrap/plugins/pid';
import { PID_FILE } from '@/runtime/bootstrap/plugins/pid';

export type PidStatus =
  | { state: 'running'; pid: number }
  | { state: 'stale'; pid: number }
  | { state: 'stopped' };

/**
 * Read the PID from the .brika/brika.pid file.
 * Returns null if the file doesn't exist or contains invalid data.
 */
export async function readPid(): Promise<number | null> {
  const raw = await readFile(PID_FILE, 'utf8').catch(() => null);
  if (raw === null) return null;
  const pid = Number.parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
}

/**
 * Check whether the hub process is running, stale, or stopped.
 */
export async function checkPid(): Promise<PidStatus> {
  const pid = await readPid();
  if (pid === null) return { state: 'stopped' };
  try {
    process.kill(pid, 0);
    return { state: 'running', pid };
  } catch (e) {
    if (isErrnoException(e) && e.code === 'ESRCH') return { state: 'stale', pid };
    // EPERM: process exists but belongs to another user — still running
    return { state: 'running', pid };
  }
}

/** Remove the PID file (e.g. after detecting a stale process). */
export async function removePidFile(): Promise<void> {
  await rm(PID_FILE, { force: true });
}

/**
 * Type guard for Node.js errno exceptions.
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
