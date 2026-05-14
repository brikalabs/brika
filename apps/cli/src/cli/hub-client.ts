/**
 * HTTP client for talking to a running Brika hub. The CLI never spawns
 * the runtime in-process — every call is a fetch over loopback.
 */

import pc from 'picocolors';
import { CliError } from './errors';
import { checkPid } from './pid';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

export function hubUrl(port?: number): string {
  const host = process.env.BRIKA_HOST || DEFAULT_HOST;
  const p = port ?? Number(process.env.BRIKA_PORT || DEFAULT_PORT);
  return new URL(`http://${host}:${p}`).origin;
}

export function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, hubUrl()), init);
}

export async function hubFetchOk(path: string, init?: RequestInit): Promise<Response> {
  const res = await hubFetch(path, init);
  if (!res.ok) {
    const body = await res.text();
    const detail = body || `hub returned ${res.status}`;
    throw new CliError(`${pc.red('Error')} — ${detail}`);
  }
  return res;
}

export async function requireRunningHub(): Promise<void> {
  const status = await checkPid();
  if (status.state !== 'running') {
    throw new CliError(`${pc.red('Hub is not running.')} Start it with: ${pc.cyan('brika start')}`);
  }
}
