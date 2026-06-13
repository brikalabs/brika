/**
 * `brika uninstall`: remove the Brika installation from this machine.
 *
 * By default this removes only the binary, PATH entries, and shell
 * completions. Your data dir (DB, installed plugins, secrets, config) is
 * kept. Pass `--purge` to additionally delete the data dir AND the stored
 * secrets in the OS keychain. The shell uninstall scripts delegate here so the
 * removal logic lives in one place.
 */

import { defineCommand } from '@brika/cli';
import { selfUninstall } from '@brika/hub/uninstaller';

export default defineCommand({
  name: 'uninstall',
  description: 'Remove Brika from this machine',
  details: [
    'Removes the binary, PATH entries, and shell completions. Your data dir',
    '(database, installed plugins, secrets, config) is KEPT unless you pass',
    '--purge, which also wipes the data dir and the OS keychain bucket.',
    '',
    '  brika uninstall            Remove the binary, keep data',
    '  brika uninstall --purge    Remove the binary AND all data + secrets',
  ].join('\n'),
  options: {
    purge: {
      type: 'boolean',
      default: false,
      description: 'Also delete the data dir and stored secrets (irreversible)',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Skip the confirmation prompt (for scripts/CI)',
    },
  },
  examples: ['brika uninstall', 'brika uninstall --purge', 'brika uninstall --purge --yes'],
  async handler({ values }) {
    await selfUninstall({ purge: values.purge, yes: values.yes });
  },
});
