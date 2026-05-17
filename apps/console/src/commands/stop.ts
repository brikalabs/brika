/**
 * `brika stop` — send SIGTERM to the running hub.
 *
 * Reads the PID from `${BRIKA_HOME}/brika.pid` and signals it. Stale
 * pid files (process gone) get cleared so the next `brika start` boots
 * cleanly. If there's no pid file but a hub is still serving on the
 * port (started externally), we say so rather than pretending it's
 * stopped — the user has to kill that one themselves.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { checkPid, removePidFile } from '../shared/cli/pid';

export default defineCommand({
  name: 'stop',
  description: 'Stop the running Brika hub (SIGTERM)',
  examples: ['brika stop'],
  async handler() {
    const status = await checkPid();
    if (status.state === 'stopped') {
      process.stdout.write(`${pc.dim('hub is not running')}\n`);
      return;
    }
    if (status.state === 'stale') {
      await removePidFile();
      process.stdout.write(`${pc.yellow('stale pid file — cleared')}\n`);
      return;
    }
    if (status.pid === null) {
      throw new CliError(
        "hub is running but wasn't started by this CLI (no pid file). Kill it yourself."
      );
    }
    try {
      process.kill(status.pid, 'SIGTERM');
      process.stdout.write(`${pc.green('sent SIGTERM')} to pid ${status.pid}\n`);
    } catch (e) {
      throw new CliError(
        `couldn't signal pid ${status.pid}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  },
});
