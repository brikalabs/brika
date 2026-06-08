/**
 * `brika create [name]` — scaffold a new plugin.
 *
 * The same scaffolder as `bun create brika`, surfaced in the main CLI so authors
 * stay in `brika <verb>`. Reuses create-brika's `runCreate` (one source of
 * truth: the template + prompts live in the create-brika package).
 */

import { defineCommand } from '@brika/cli';
import { runCreate } from 'create-brika/run';

export default defineCommand({
  name: 'create',
  description: 'Scaffold a new Brika plugin (same as `bun create brika`)',
  details:
    'Prompts for any details not given as the name positional or flags, then writes the plugin ' +
    'with the opinionated brika scripts and tsconfig.',
  options: {
    'no-git': { type: 'boolean', description: 'Skip git initialization' },
    'no-install': { type: 'boolean', description: 'Skip dependency installation' },
  },
  examples: ['brika create', 'brika create my-plugin', 'brika create my-plugin --no-install'],
  async handler({ values, positionals }) {
    await runCreate({
      name: positionals[0],
      git: !values.noGit,
      install: !values.noInstall,
    });
  },
});
