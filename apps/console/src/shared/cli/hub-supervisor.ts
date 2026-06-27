/**
 * Foreground hub supervisor — the chunk of work shared by `brika hub`
 * and `brika start --attach`. Both commands need the same five steps:
 *
 *   1. Claim `${BRIKA_HOME}/brika.pid` so the TUI's poll loop, peer
 *      CLI invocations, and `brika status` all agree that we own it.
 *   2. Register a synchronous `process.on('exit')` cleanup so the pid
 *      file and the local-trust `cli-token` are gone the moment the
 *      hub goes away (whether via Ctrl+C, SIGTERM, or a clean shutdown
 *      driven by `trapSignals` inside the hub).
 *   3. Apply caller-supplied port/host overrides via env vars — the
 *      hub config layer reads `BRIKA_PORT` / `BRIKA_HOST` at boot.
 *   4. Print a tiny "booting hub…" banner so the operator sees a
 *      heartbeat before the hub itself starts logging.
 *   5. Run the hub bootstrap inline via `startHub()`. The hub's own
 *      `trapSignals` plugin handles SIGINT/SIGTERM and calls
 *      `process.exit(0)`, which fires our exit handler.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { startHub } from '@brika/hub';
import pc from 'picocolors';
import { CliError } from './errors';
import { systemDir } from './paths';
import { claimPidFile } from './pid-claim';

export interface RunForegroundHubOptions {
  readonly port?: string;
  readonly host?: string;
}

export async function runForegroundHub(
  opts: Readonly<RunForegroundHubOptions> = {}
): Promise<void> {
  const existing = await claimPidFile();
  if (existing !== null) {
    throw new CliError(`${pc.red('Already running')} — pid ${existing}. Use \`brika stop\` first.`);
  }
  process.on('exit', () => {
    const sys = systemDir();
    rmSync(join(sys, 'brika.pid'), { force: true });
    rmSync(join(sys, 'cli-token'), { force: true });
  });
  if (opts.port) {
    process.env.BRIKA_PORT = String(opts.port);
  }
  if (opts.host) {
    process.env.BRIKA_HOST = String(opts.host);
  }
  process.stdout.write(`${pc.cyan('booting hub…')}\n`);
  await startHub();
}
