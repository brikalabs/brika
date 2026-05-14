/**
 * Command registration for the Brika CLI. Add new commands by
 * importing them and chaining `addCommand`. The dashboard is the
 * default — running `brika` with no args lands there.
 */

import { createCli } from '@brika/cli';
import completions from './commands/completions';
import dashboard from './commands/dashboard';
import open from './commands/open';
import restart from './commands/restart';
import start from './commands/start';
import status from './commands/status';
import stop from './commands/stop';
import version from './commands/version';

export const cli = createCli({ name: 'brika', defaultCommand: 'dashboard' })
  .addCommand(dashboard)
  .addCommand(start)
  .addCommand(stop)
  .addCommand(restart)
  .addCommand(status)
  .addCommand(open)
  .addCommand(version)
  .addCommand(completions)
  .addHelp();
