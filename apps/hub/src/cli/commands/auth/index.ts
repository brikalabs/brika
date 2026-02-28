import { createCli } from '../../cli';
import user from './user';
import token from './token';

export default createCli({
  defaultCommand: 'help',
  // Note: No requireRunningHub - auth commands work independently using SQLite
})
  .addCommand(user)
  .addCommand(token)
  .addHelp()
  .toCommand('auth', 'Manage authentication and tokens');
