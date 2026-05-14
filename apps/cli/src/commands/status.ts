/**
 * One-shot hub status. Reports running / stopped / stale and clears
 * the PID file if stale. Brix narrates the result.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import { checkPid, removePidFile } from '../cli/pid';

export default defineCommand({
  name: 'status',
  description: 'Show whether the hub is running',
  examples: ['brika status'],
  async handler() {
    const status = await checkPid();
    switch (status.state) {
      case 'running':
        brix.ok(`running  pid ${status.pid}`);
        return;
      case 'stale':
        brix.warn(`stale pid ${status.pid} — cleared`);
        await removePidFile();
        return;
      case 'stopped':
        brix.info('stopped');
        return;
    }
  },
});
