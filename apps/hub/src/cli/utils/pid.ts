import { readFile } from 'node:fs/promises';
import { PID_FILE } from '@/runtime/bootstrap/plugins/pid';

export { PID_FILE };

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
 * Type guard for Node.js errno exceptions.
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
