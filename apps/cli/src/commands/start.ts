/**
 * `brika start` — boot the hub.
 *
 * Spawns the hub binary as a child with `BRIKA_SUPERVISOR_PID` so the
 * hub's own start handler falls through into its in-process server.
 * The CLI:
 *   • claims `.brika/brika.pid` (refusing if another supervisor is
 *     already running here),
 *   • forwards SIGINT / SIGTERM to the child,
 *   • waits for the child to exit, then removes the PID file.
 *
 * Restart-on-SIGUSR1 and `--background` detach are tracked as
 * follow-ups in `docs/cli-tui/tasks.md`.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../cli/errors';
import { spawnHub } from '../cli/hub-spawn';
import { removePidFile } from '../cli/pid';
import { claimPidFile } from '../cli/pid-claim';

export default defineCommand({
  name: 'start',
  description: 'Start the Brika hub',
  details:
    'Spawns the hub server in this directory. Currently always foreground — `--background` detach lands in a follow-up.',
  options: {
    port: {
      type: 'string',
      short: 'p',
      description: 'Listen port (default: 3001)',
    },
    host: {
      type: 'string',
      description: 'Listen address (default: 127.0.0.1)',
    },
    open: {
      type: 'boolean',
      short: 'o',
      description: 'Open the UI in the default browser once the hub is up',
    },
  },
  examples: [
    'brika start',
    'brika start -p 8080',
    'brika start --host 0.0.0.0',
    'brika start --open',
  ],
  async handler({ values }) {
    const existing = await claimPidFile();
    if (existing !== null) {
      throw new CliError(
        `${pc.red('Already running')} — pid ${existing}. Stop it first with ${pc.cyan('brika stop')}.`
      );
    }

    brix.think('booting hub…');
    const child = spawnHub({
      port: values.port,
      host: values.host,
      foreground: true,
    });

    // Forward signals; let the hub handle its own graceful shutdown.
    const forward = (sig: 'SIGINT' | 'SIGTERM'): void => {
      try {
        child.kill(sig);
      } catch {
        /* child may have already exited */
      }
    };
    process.once('SIGINT', () => forward('SIGINT'));
    process.once('SIGTERM', () => forward('SIGTERM'));

    if (values.open) {
      // The hub takes a beat to bind; deferred dynamic import keeps
      // the open util off the cold path for non-`--open` invocations.
      setTimeout(async () => {
        const [{ hubUrl }, { openBrowser }] = await Promise.all([
          import('../cli/hub-client'),
          import('../cli/open'),
        ]);
        openBrowser(hubUrl());
      }, 1500);
    }

    const code = await child.exited;
    await removePidFile();
    if (code === 0 || code === null) {
      brix.ok('hub exited cleanly');
      return;
    }
    brix.fail(`hub exited with code ${code}`);
    process.exit(code);
  },
});
