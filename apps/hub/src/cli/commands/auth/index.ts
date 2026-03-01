import { createCli } from '../../cli';
import token from './token';
import user from './user';

export default createCli({
  defaultCommand: 'help',
  // Note: No requireRunningHub - auth commands work independently using SQLite
})
  .addCommand(user)
  .addCommand(token)
  .addHelp()
  .toCommand('auth', 'Manage authentication and tokens');
