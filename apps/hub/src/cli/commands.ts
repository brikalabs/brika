import { createCli } from './cli';
import open from './commands/open';
import plugin from './commands/plugin';
import start from './commands/start';
import status from './commands/status';
import stop from './commands/stop';
import uninstall from './commands/uninstall';
import update from './commands/update';
import version from './commands/version';

export const cli = createCli()
  .addCommand(start)
  .addCommand(stop)
  .addCommand(status)
  .addCommand(open)
  .addCommand(plugin)
  .addCommand(version)
  .addCommand(update)
  .addCommand(uninstall)
  .addHelp();
