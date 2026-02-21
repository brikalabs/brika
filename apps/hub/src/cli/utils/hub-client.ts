import pc from 'picocolors';
import { isErrnoException, readPid } from './pid';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

/** Build the hub's base URL from env/flags or defaults. */
export function hubUrl(port?: number): string {
  const host = process.env.BRIKA_HOST || DEFAULT_HOST;
  const p = port ?? Number(process.env.BRIKA_PORT || DEFAULT_PORT);
  return new URL(`http://${host}:${p}`).origin;
}

/** Fetch from the running hub. Throws on network errors. */
export function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, hubUrl()), init);
}

/** Fetch from the running hub, exit with error if the response is not ok. */
export async function hubFetchOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await hubFetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    console.error(`${pc.red('Error')} — ${body || `hub returned ${res.status}`}`);
    process.exit(1);
  }
  return res;
}

/**
 * Assert that the hub is currently running.
 * Prints an error and exits if it's not.
 */
export async function requireRunningHub(): Promise<void> {
  const pid = await readPid();
  let running = pid !== null;
  if (pid !== null) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (isErrnoException(e) && e.code === 'ESRCH') running = false;
    }
  }
  if (!running) {
    console.error(`${pc.red('Hub is not running.')} Start it with: ${pc.cyan('brika start')}`);
    process.exit(1);
  }
}
