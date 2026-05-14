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
  examples: ['brika', 'brika dashboard'],
  async handler() {
    await runTui(React.createElement(App, { version: CLI_VERSION }));
  },
});
