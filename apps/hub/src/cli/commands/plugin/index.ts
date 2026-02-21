import { createCli } from '../../cli';
import { requireRunningHub } from '../../utils/hub-client';
import install from './install';
import list from './list';
import uninstall from './uninstall';

export default createCli({
  defaultCommand: 'help',
  before: requireRunningHub,
})
  .addCommand(install)
  .addCommand(uninstall)
  .addCommand(list)
  .addHelp()
  .toCommand('plugin', 'Manage plugins (install, uninstall, list)');
