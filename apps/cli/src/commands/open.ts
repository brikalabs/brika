/**
 * `brika open` — open the hub's UI in the default browser. TUI view
 * animates the action; plain-text fallback for non-TTY.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import React from 'react';
import { hubUrl } from '../cli/hub-client';
import { openBrowser } from '../cli/open';
import { checkPid } from '../cli/pid';
import { runCommandTui } from '../tui/runCommandTui';
import { OpenView } from '../tui/views/OpenView';

export default defineCommand({
  name: 'open',
  description: 'Open the Brika UI in the default browser',
  examples: ['brika open'],
  async handler() {
    await runCommandTui(React.createElement(OpenView), async () => {
      const status = await checkPid();
      if (status.state !== 'running') {
        brix.info('hub is sleeping — nothing to open');
        return;
      }
      const url = hubUrl();
      openBrowser(url);
      brix.ok(`opening ${url}`);
    });
  },
});
