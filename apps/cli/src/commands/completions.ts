/**
 * `brika completions` — install / uninstall / print shell completions.
 *
 * The default flow (no flags) auto-detects the shell and writes the
 * completion script into the user's profile. `--uninstall` strips it.
 * Passing an explicit shell name prints the raw script to stdout —
 * intentionally NOT wrapped in a TUI, since the user is piping it.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import React from 'react';
import { CompletionsView } from '../features/completions';
import { runCommandTui } from '../runCommandTui';
import {
  generateCompletions,
  isShell,
  shellList,
  uninstallCompletions,
} from '../shared/cli/completions';
import { CliError } from '../shared/cli/errors';

export default defineCommand({
  name: 'completions',
  description: 'Set up shell tab-completion',
  details: [
    'Installs completions into your shell profile (auto-detects shell).',
    `Supported shells: ${shellList()}.`,
    '',
    '  brika completions              Install completions',
    '  brika completions --uninstall  Remove completions',
    '  brika completions zsh          Print raw script (for custom setups)',
  ].join('\n'),
  options: {
    uninstall: {
      type: 'boolean',
      description: 'Remove completions from shell profile',
    },
  },
  examples: ['brika completions', 'brika completions --uninstall', 'brika completions zsh'],
  async handler({ values, positionals, commands }) {
    if (values.uninstall) {
      const cleaned = await uninstallCompletions();
      if (cleaned.length === 0) {
        process.stdout.write('no completions to remove\n');
        return;
      }
      for (const file of cleaned) {
        const label = pc.green(`removed ${file}`);
        process.stdout.write(`${label}\n`);
      }
      process.stdout.write('restart your shell to apply\n');
      return;
    }

    // `brika completions <shell>` — print raw script. Pipe-friendly,
    // so we deliberately bypass the TUI here.
    const explicit = positionals[0];
    if (explicit) {
      if (!isShell(explicit)) {
        throw new CliError(
          `${pc.red('Unknown shell:')} ${explicit}\nSupported: ${pc.cyan(shellList())}`
        );
      }
      process.stdout.write(generateCompletions(commands, explicit));
      return;
    }

    // Default install flow — TUI when interactive, brix.* when not.
    await runCommandTui(React.createElement(CompletionsView, { commands }));
  },
});
