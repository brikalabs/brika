/**
 * `brika hub` — headless hub boot.
 *
 * This is the ONLY brika subcommand that doesn't render a TUI. It exists
 * for two callers:
 *
 *   1. The brika TUI (`brika`) spawns it as a detached child when the
 *      user presses `s` to start the hub.
 *   2. Compose / Docker / systemd / CI workflows that want to launch
 *      the hub without an attached terminal.
 *
 * Mechanically the same as the old `brika start --foreground`: claim
 * the PID file, spawn the hub binary with `BRIKA_SUPERVISOR_PID` set,
 * forward SIGINT/SIGTERM, clean up on exit. Restart-on-SIGUSR1 and
 * `--background` detach are deferred follow-ups.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../cli/errors';
import { spawnHub } from '../cli/hub-spawn';
import { removePidFile } from '../cli/pid';
import { claimPidFile } from '../cli/pid-claim';

export default defineCommand({
  name: 'hub',
  description: 'Boot the Brika hub (headless, no TUI)',
  details: 'Used by the TUI to spawn the server, and by CI/Docker entrypoints.',
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
  },
  examples: ['brika hub', 'brika hub -p 8080', 'brika hub --host 0.0.0.0'],
  async handler({ values }) {
    const existing = await claimPidFile();
    if (existing !== null) {
      throw new CliError(
        `${pc.red('Already running')} — pid ${existing}. Use the TUI's stop action first.`
      );
    }

    brix.think('booting hub…');
    const child = spawnHub({
      port: values.port,
      host: values.host,
      foreground: true,
    });

    const forward = (sig: 'SIGINT' | 'SIGTERM'): void => {
      try {
        child.kill(sig);
      } catch {
        /* child may have already exited */
      }
    };
    process.once('SIGINT', () => forward('SIGINT'));
    process.once('SIGTERM', () => forward('SIGTERM'));

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
