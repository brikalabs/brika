/**
 * Minimal loopback client the lean `brika` bin uses to drive an ALREADY-running
 * hub (install a plugin through the registry). It deliberately mirrors the
 * richer client the full Brika app ships in apps/console/src/shared/cli
 * (hub-client.ts, paths.ts, auth-token.ts): same loopback origin, the same
 * `${BRIKA_HOME}/cli-token` local-trust auth, the same `/api/registry/install`
 * SSE protocol. Byte-parity is the point: the lean bin authenticates wherever
 * the full app's `brika install` does. What it cannot do is START a hub (that
 * needs the full app's supervisor); when none is reachable the caller explains
 * how to get one. Keep in sync with the console copy.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CliError } from '@brika/cli';
import pc from 'picocolors';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

/** The hub's loopback origin, honoring BRIKA_HOST / BRIKA_PORT. */
export function hubOrigin(): string {
  const host = process.env.BRIKA_HOST || DEFAULT_HOST;
  const port = Number(process.env.BRIKA_PORT || DEFAULT_PORT);
  return new URL(`http://${host}:${port}`).origin;
}

/** Walk up from cwd for the workspace-root package.json (the one with `workspaces`). */
function findWorkspaceRoot(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(pkg, 'utf8'));
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'workspaces' in parsed &&
          parsed.workspaces !== undefined
        ) {
          return dir;
        }
      } catch {
        // Malformed package.json: keep climbing.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return undefined;
}

/**
 * The brika data dir, resolved the way the hub and the console CLI do: $BRIKA_HOME,
 * else the workspace root's .brika (dev), else <cwd>/.brika. The console additionally
 * has a compiled-binary branch; the lean bin is always a `bun`-run script, never the
 * compiled app, so that branch never applies here. Keep in sync with
 * apps/console/src/shared/cli/paths.ts.
 */
function brikaHome(): string {
  const fromEnv = process.env.BRIKA_HOME;
  if (fromEnv) {
    return fromEnv;
  }
  return join(findWorkspaceRoot() ?? process.cwd(), '.brika');
}

/** The data dir this CLI authenticates from (its cli-token lives here). Exposed
 * for diagnostics: with multiple hubs, this is how you see which one a command
 * targets. */
export function cliDataDir(): string {
  return brikaHome();
}

/** The local-trust CLI token the hub supervisor wrote, or null when absent. */
function readCliToken(): string | null {
  try {
    const raw = readFileSync(join(brikaHome(), 'cli-token'), 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** True when a hub answers `/api/health` (public, no auth) on the loopback origin. */
export async function pingHub(): Promise<boolean> {
  try {
    const res = await fetch(`${hubOrigin()}/api/health`, { signal: AbortSignal.timeout(500) });
    return res.status >= 0;
  } catch {
    return false;
  }
}

/** fetch against the hub with the local-trust token attached when present. */
function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = readCliToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(new URL(path, hubOrigin()), { ...init, headers });
}

interface InstallProgress {
  phase?: string;
  message?: string;
  error?: string;
}

/** One registry SSE `data:` line to its progress object, or null to skip. */
function parseProgressLine(line: string): InstallProgress | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  const json = line.slice(5).trim();
  if (!json) {
    return null;
  }
  try {
    const parsed: InstallProgress = JSON.parse(json);
    return parsed;
  } catch {
    return null;
  }
}

/** POST a registry install to the running hub and stream its SSE progress. */
export async function installViaRegistry(pkg: string, version?: string): Promise<void> {
  const res = await hubFetch('/api/registry/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(version ? { package: pkg, version } : { package: pkg }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text();
    if (res.status === 401 || res.status === 403) {
      // Names the exact origin + data dir so a multi-hub mismatch is obvious:
      // the hub at this origin uses a different data dir than the token we sent.
      throw new CliError(
        `the hub at ${hubOrigin()} rejected the install (${res.status}): this CLI authenticated with the token in ${cliDataDir()}, which that hub does not accept.\n` +
          `  Point at the right hub with BRIKA_HOST / BRIKA_PORT and BRIKA_HOME, or use the full \`brika\` app.`
      );
    }
    throw new CliError(`install request failed: ${res.status} ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let failure: string | undefined;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const progress = parseProgressLine(line);
      if (!progress) {
        continue;
      }
      if (progress.message) {
        process.stdout.write(`  ${pc.dim(progress.message)}\n`);
      }
      if (progress.phase === 'error') {
        failure = progress.error ?? progress.message ?? 'unknown error';
      }
    }
  }
  if (failure) {
    throw new CliError(`install failed: ${failure}`);
  }
}
