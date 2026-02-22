import pc from 'picocolors';
import { CliError } from '../errors';
import { checkPid } from './pid';

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

/** Fetch from the running hub, throw if the response is not ok. */
export async function hubFetchOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await hubFetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new CliError(`${pc.red('Error')} — ${body || `hub returned ${res.status}`}`);
  }
  return res;
}

/** Assert that the hub is currently running. Throws if it's not. */
export async function requireRunningHub(): Promise<void> {
  const status = await checkPid();
  if (status.state !== 'running') {
    throw new CliError(`${pc.red('Hub is not running.')} Start it with: ${pc.cyan('brika start')}`);
  }
}
