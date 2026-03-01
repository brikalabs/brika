import { createCli } from '../../cli';
import userAdd from './user-add';
import userDelete from './user-delete';
import userEdit from './user-edit';
import userList from './user-list';

export default createCli({
  defaultCommand: 'help',
})
  .addCommand(userAdd)
  .addCommand(userEdit)
  .addCommand(userList)
  .addCommand(userDelete)
  .addHelp()
  .toCommand('user', 'Manage users (add, edit, list, delete)');
