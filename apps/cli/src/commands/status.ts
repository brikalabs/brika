/**
 * `brika status` — render a TUI view that polls the PID file and
 * announces the result through Brix. Plain-text fallback for
 * non-TTY contexts (CI, pipes).
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import React from 'react';
import { checkPid, removePidFile } from '../cli/pid';
import { runCommandTui } from '../tui/runCommandTui';
import { StatusView } from '../tui/views/StatusView';

export default defineCommand({
  name: 'status',
  description: 'Show whether the hub is running',
  examples: ['brika status'],
  async handler() {
    await runCommandTui(React.createElement(StatusView), async () => {
      const status = await checkPid();
      switch (status.state) {
        case 'running':
          brix.ok(`running  pid ${status.pid}`);
          return;
        case 'stale':
          await removePidFile();
          brix.warn(`stale pid ${status.pid} — cleared`);
          return;
        case 'stopped':
          brix.info('stopped');
          return;
      }
    });
  },
});
