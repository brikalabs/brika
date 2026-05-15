/**
 * Default command — renders the Brika dashboard TUI. Triggered when
 * the user runs `brika` with no args, or `brika dashboard` explicitly.
 */

import { defineCommand } from '@brika/cli';
import { runTui } from '@brika/cli/tui';
import React from 'react';
import { App } from '../tui/App';
import { CLI_VERSION } from '../version';

export default defineCommand({
  name: 'dashboard',
  description: 'Open the Brika dashboard (default)',
  options: {
    'no-boot': {
      type: 'boolean',
      description: 'Skip the boot splash',
    },
  },
  examples: ['brika', 'brika dashboard', 'brika --no-boot'],
  async handler({ values }) {
    const boot = !values['no-boot'] && process.env.BRIKA_NO_BOOT !== '1';
    await runTui(React.createElement(App, { version: CLI_VERSION, boot }));
  },
});
