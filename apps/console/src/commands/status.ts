/**
 * `brika status` — script-friendly one-line hub status.
 *
 * Emits `running pid=N url=…` / `running url=…` (externally started) /
 * `stopped` / `stale pid=N` so callers can grep for the state and pull
 * the pid out without parsing prose.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { hubUrl } from '../shared/cli/hub-client';
import { checkPid } from '../shared/cli/pid';

export default defineCommand({
  name: 'status',
  description: 'Print the current hub status (state, pid, url)',
  examples: ['brika status'],
  async handler() {
    const status = await checkPid();
    const url = hubUrl();
    switch (status.state) {
      case 'running': {
        const pidPart = status.pid === null ? '' : ` pid=${status.pid}`;
        process.stdout.write(`${pc.green('running')}${pidPart} url=${url}\n`);
        return;
      }
      case 'stale':
        process.stdout.write(`${pc.yellow('stale')} pid=${status.pid}\n`);
        process.exit(2);
        return;
      case 'stopped':
        process.stdout.write(`${pc.dim('stopped')}\n`);
        process.exit(1);
    }
  },
});
