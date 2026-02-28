import { createCli } from '../../cli';
import tokenCreate from './token-create';

export default createCli({
  defaultCommand: 'help',
})
  .addCommand(tokenCreate)
  .addHelp()
  .toCommand('token', 'Manage API tokens (create)');
