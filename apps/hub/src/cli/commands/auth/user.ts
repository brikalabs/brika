import { createCli } from '../../cli';
import userAdd from './user-add';
import userEdit from './user-edit';
import userList from './user-list';
import userDelete from './user-delete';

export default createCli({
  defaultCommand: 'help',
})
  .addCommand(userAdd)
  .addCommand(userEdit)
  .addCommand(userList)
  .addCommand(userDelete)
  .addHelp()
  .toCommand('user', 'Manage users (add, edit, list, delete)');
