/**
 * PID File Plugin
 *
 * Writes the process PID to .brika/brika.pid on start and removes it on stop.
 * This allows `brika stop` and `brika status` to find and control a running hub.
 *
 * Also guards against starting a second instance in the same workspace by checking
 * for an existing PID file before the HTTP server attempts to bind the port.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BootstrapPlugin } from '../plugin';

export const PID_FILE = join(process.cwd(), '.brika', 'brika.pid');

export function pid(): BootstrapPlugin {
  const pidFile = join(process.cwd(), '.brika', 'brika.pid');

  return {
    name: 'pid',

    /**
     * onInit runs before the HTTP server binds — the right place to detect
     * a conflicting instance and fail fast with a clear message.
     */
    async onInit() {
      const raw = await readFile(pidFile, 'utf8').catch(() => null);
      if (raw === null) return; // No PID file — safe to start

      const existingPid = Number.parseInt(raw, 10);

      try {
        process.kill(existingPid, 0); // Probe: throws ESRCH if gone, EPERM if alive but not ours
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
          // Process is gone — stale PID file, clean up and proceed
          await rm(pidFile, { force: true }).catch(() => undefined);
          return;
        }
        // EPERM = process exists but owned by another user — still counts as running
      }

      // Process is alive (kill succeeded, or EPERM) — refuse to start
      throw new Error(
        `Another instance of Brika is already running in this directory (PID ${existingPid}).\nRun 'brika stop' to stop it first.`
      );
    },

    async onStart() {
      await writeFile(pidFile, String(process.pid), 'utf8');
    },

    async onStop() {
      await rm(pidFile, { force: true }).catch(() => undefined);
    },
  };
}
