/**
 * `brika restart` — signal the running supervisor to cycle the hub.
 * TUI view animates the transition; plain-text fallback for non-TTY.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import React from 'react';
import { checkPid, removePidFile } from '../cli/pid';
import { runCommandTui } from '../tui/runCommandTui';
import { RestartView } from '../tui/views/RestartView';

export default defineCommand({
  name: 'restart',
  description: 'Restart the running hub',
  details: 'Sends SIGUSR1 to the Brika supervisor, which cycles the hub child.',
  examples: ['brika restart'],
  async handler() {
    await runCommandTui(React.createElement(RestartView), async () => {
      const status = await checkPid();
      if (status.state === 'stopped') {
        brix.info("nothing to restart — hub isn't running");
        return;
      }
      if (status.state === 'stale') {
        await removePidFile();
        brix.warn(`stale pid ${status.pid} — cleared`);
        return;
      }
      process.kill(status.pid, 'SIGUSR1');
      brix.ok(`signal sent to pid ${status.pid}`);
    });
  },
});
