/**
 * "Is the hub up?" — combines a PID-file check with a live HTTP probe.
 *
 * The PID file is authoritative when present (we own it, we know the
 * pid), but it isn't the whole story:
 *
 *   - A hub started outside the brika supervisor (`bun --watch
 *     apps/hub/src/cli.ts`, docker compose with a host volume, etc.)
 *     never writes the file but still serves on `:3001`.
 *   - The pid file can be stale (process died without cleanup, file
 *     adopted from a previous run, etc.) yet a different process now
 *     holds the port.
 *
 * So we fall back to `GET /api/health` when the pid file is missing
 * or stale. If the health endpoint answers, the hub is up — we just
 * don't have a pid to display, hence `pid: null` on that branch.
 *
 * Mirrors `apps/hub/src/cli/utils/pid.ts` for the file side; the
 * probe is loopback-only via `hubFetch` so it inherits BRIKA_HOST /
 * BRIKA_PORT.
 */

import { readFile, rm } from 'node:fs/promises';
import { pidFile } from './paths';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

function healthUrl(): string {
  const host = process.env.BRIKA_HOST || DEFAULT_HOST;
  const port = Number(process.env.BRIKA_PORT || DEFAULT_PORT);
  return `http://${host}:${port}/api/health`;
}

export type PidStatus =
  | { state: 'running'; pid: number | null }
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

/**
 * Probe `/api/health` (public, no auth) with a short timeout. Any HTTP
 * response — even 4xx — means *something* is listening; what we care
 * about here is liveness, not whether we're authenticated. URL is
 * built inline rather than going through `hubFetch` to avoid an
 * import cycle (hub-client needs `checkPid` for `requireRunningHub`).
 */
export async function pingHub(): Promise<boolean> {
  try {
    const res = await fetch(healthUrl(), { signal: AbortSignal.timeout(500) });
    return res.status >= 0;
  } catch {
    return false;
  }
}

export async function checkPid(): Promise<PidStatus> {
  const pid = await readPid();
  if (pid === null) {
    // No pid file — could be an externally-started hub. Probe the port.
    return (await pingHub()) ? { state: 'running', pid: null } : { state: 'stopped' };
  }
  try {
    process.kill(pid, 0);
    return { state: 'running', pid };
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ESRCH') {
      // Process under that pid is gone — check if SOMETHING is still
      // serving on the port (could be an unrelated hub or a takeover).
      return (await pingHub()) ? { state: 'running', pid: null } : { state: 'stale', pid };
    }
    // EPERM: alive but owned by another user — still counts as running.
    return { state: 'running', pid };
  }
}

export async function removePidFile(): Promise<void> {
  await rm(pidFile(), { force: true });
}
