/**
 * `brika version` — Brix types the wordmark + version. Falls back to
 * a plain line when stdout isn't a TTY (so `brika version | grep …`
 * still works).
 */

import { defineCommand } from '@brika/cli';
import React from 'react';
import { runCommandTui } from '../runCommandTui';
import { VersionView } from '../features/version';
import { CLI_VERSION } from '../version';

export default defineCommand({
  name: 'version',
  aliases: ['-v', '--version'],
  description: "Show Brika's version",
  examples: ['brika version', 'brika -v'],
  async handler() {
    await runCommandTui(React.createElement(VersionView), () => {
      process.stdout.write(`Brika Runtime v${CLI_VERSION}\n`);
    });
  },
});
