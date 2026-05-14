/**
 * Command registration for the Brika CLI. Add new commands by
 * importing them and chaining `addCommand`. The dashboard is the
 * default — running `brika` with no args lands there.
 */

import { createCli } from '@brika/cli';
import dashboard from './commands/dashboard';
import status from './commands/status';
import version from './commands/version';

export const cli = createCli({ name: 'brika', defaultCommand: 'dashboard' })
  .addCommand(dashboard)
  .addCommand(status)
  .addCommand(version)
  .addHelp();
