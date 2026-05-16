/**
 * Resolve and spawn the hub binary as a child of the CLI.
 *
 * The CLI deliberately doesn't link the hub runtime — it shells out
 * instead. In dev that means re-invoking `apps/hub/src/cli.ts` with
 * `BRIKA_SUPERVISOR_PID` set; the hub bin sees the env var and falls
 * through into its in-process server (`@/main`) without re-running
 * its own supervisor loop. Compiled-mode resolution is a follow-up
 * (see `docs/cli-tui/brika-cli.md` open questions).
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors';

const HUB_ENTRY_REL = 'apps/hub/src/cli.ts';

/** Find the hub entry point by walking up from this file. */
export function resolveHubEntry(): string {
  if (process.env.BRIKA_HUB_ENTRY) {
    return process.env.BRIKA_HUB_ENTRY;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, HUB_ENTRY_REL);
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = dirname(dir);
  }
  throw new CliError("Couldn't find the hub binary. Set BRIKA_HUB_ENTRY to its path explicitly.");
}

export interface SpawnOptions {
  readonly port?: string;
  readonly host?: string;
  readonly foreground: boolean;
}

/**
 * Spawn the hub. Inherits stdio so its output stays visible (foreground
 * use) — callers that want to silence it should redirect themselves.
 *
 * Returns the spawned subprocess so the caller can wire signal forwarding
 * and wait on `.exited`.
 */
export function spawnHub(opts: Readonly<SpawnOptions>): ReturnType<typeof Bun.spawn> {
  const entry = resolveHubEntry();
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    BRIKA_SUPERVISOR_PID: String(process.pid),
  };
  if (opts.port) {
    env.BRIKA_PORT = opts.port;
  }
  if (opts.host) {
    env.BRIKA_HOST = opts.host;
  }
  // Pass --foreground so the hub's own start handler hits the
  // BRIKA_SUPERVISOR_PID branch immediately and skips its supervisor.
  const args = [process.execPath, entry, 'start', '--foreground'];
  return Bun.spawn(args, {
    env,
    stdin: opts.foreground ? 'inherit' : 'ignore',
    stdout: opts.foreground ? 'inherit' : 'ignore',
    stderr: opts.foreground ? 'inherit' : 'ignore',
  });
}
