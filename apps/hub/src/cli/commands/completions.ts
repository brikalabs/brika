import pc from 'picocolors';
import { defineCommand } from '../command';
import {
  detectShell,
  generateCompletions,
  installCompletions,
  isShell,
  shellList,
  uninstallCompletions,
} from '../completions';
import { CliError } from '../errors';

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
    uninstall: { type: 'boolean', description: 'Remove completions from shell profile' },
  },
  examples: ['brika completions', 'brika completions --uninstall', 'brika completions zsh'],
  async handler({ values, positionals, commands }) {
    // values.uninstall is boolean | undefined
    if (values.uninstall) {
      const cleaned = await uninstallCompletions();
      if (cleaned.length === 0) {
        console.log(pc.dim('No completions found to remove.'));
      } else {
        for (const file of cleaned) {
          console.log(`${pc.green('Removed')} completions from ${pc.dim(file)}`);
        }
        console.log(pc.dim('Restart your shell to apply.'));
      }
      return;
    }

    // brika completions bash|zsh|fish  →  print raw script
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

    // brika completions  →  auto-detect & install
    const shell = detectShell();
    if (!shell) {
      throw new CliError(
        `${pc.red('Could not detect shell.')} Pass one explicitly: brika completions <${shellList()}>`
      );
    }

    const { file, alreadyInstalled } = await installCompletions(shell, commands);
    if (alreadyInstalled) {
      console.log(`${pc.dim('Completions already installed in')} ${file}`);
    } else {
      console.log(`${pc.green('Installed')} ${shell} completions in ${pc.dim(file)}`);
      console.log(pc.dim('Restart your shell to apply.'));
    }
  },
});
