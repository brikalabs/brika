/**
 * `brika stop` — sends SIGTERM to the running hub. TUI view animates
 * the stopping sequence; plain-text fallback for non-TTY contexts.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import React from 'react';
import { checkPid, removePidFile } from '../cli/pid';
import { runCommandTui } from '../tui/runCommandTui';
import { StopView } from '../tui/views/StopView';

export default defineCommand({
  name: 'stop',
  description: 'Stop the running hub',
  details: 'Sends SIGTERM to the Brika hub process in the current directory.',
  examples: ['brika stop'],
  async handler() {
    await runCommandTui(React.createElement(StopView), async () => {
      const status = await checkPid();
      if (status.state === 'stopped') {
        brix.info('not running — no pid file');
        return;
      }
      if (status.state === 'stale') {
        await removePidFile();
        brix.warn(`stale pid ${status.pid} — cleared`);
        return;
      }
      process.kill(status.pid, 'SIGTERM');
      brix.ok(`sent SIGTERM to pid ${status.pid}`);
    });
  },
});
