/**
 * Atomic-ish PID file claim for `brika start`. Returns the PID of the
 * existing supervisor if one is already running here; otherwise writes
 * our own PID and returns null.
 *
 * Stale PID files (PID gone) are cleared before claiming. Race-wise
 * this is best-effort — two concurrent `brika start` invocations in
 * the same directory can both end up writing — but the running-hub
 * check below catches the common case (re-run after Ctrl+Z, etc.).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pidFile } from './paths';
import { checkPid, removePidFile } from './pid';

export async function claimPidFile(): Promise<number | null> {
  const status = await checkPid();
  if (status.state === 'running') {
    return status.pid;
  }
  if (status.state === 'stale') {
    await removePidFile();
  }
  const file = pidFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, String(process.pid), 'utf8');
  return null;
}
