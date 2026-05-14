/**
 * Print the CLI's version. Brix says it.
 */

import { brix } from '@brika/brix/log';
import { defineCommand } from '@brika/cli';
import { CLI_VERSION } from '../version';

export default defineCommand({
  name: 'version',
  aliases: ['-v', '--version'],
  description: "Show Brika's version",
  examples: ['brika version', 'brika -v'],
  handler() {
    brix.say(`Brika Runtime v${CLI_VERSION}`);
  },
});
