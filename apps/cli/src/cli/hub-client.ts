/**
 * HTTP client for talking to a running Brika hub. The CLI never spawns
 * the runtime in-process — every call is a fetch over loopback.
 *
 * Every request auto-attaches `Authorization: Bearer <cli-token>`
 * when the supervisor's local-trust token is present, so the views
 * don't have to think about auth.
 */

import pc from 'picocolors';
import { readCliToken } from './auth-token';
import { CliError } from './errors';
import { checkPid } from './pid';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

export function hubUrl(port?: number): string {
  const host = process.env.BRIKA_HOST || DEFAULT_HOST;
  const p = port ?? Number(process.env.BRIKA_PORT || DEFAULT_PORT);
  return new URL(`http://${host}:${p}`).origin;
}

/**
 * Merge the supervisor's CLI token into the caller's headers as
 * `Authorization: Bearer …`. The caller's own `Authorization` (e.g.
 * a `brika login`-issued session) wins so we don't clobber it.
 */
function withAuth(init?: RequestInit): RequestInit | undefined {
  const token = readCliToken();
  if (!token) {
    return init;
  }
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...init, headers };
}

export function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, hubUrl()), withAuth(init));
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
