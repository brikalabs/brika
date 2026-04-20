import { Role } from '@brika/auth';
import { inject } from '@brika/di';
import pc from 'picocolors';
import { defineCommand } from '../../command';
import { auth, UserService } from './auth-server';
import { bootstrapCLI, printDatabaseInfo } from './bootstrap';
import { CliError } from './errors';
import { promptEditUser, promptSelectUser, showError, showSuccess } from './prompts';
export default defineCommand({
  name: 'edit',
  description: 'Edit a user interactively',
  examples: ['brika auth user edit'],
  async handler() {
    const cli = await bootstrapCLI(auth());

    try {
      const userService = inject(UserService);
      const users = userService.listUsers();

      if (users.length === 0) {
        showError('No users found');
        return;
      }

      const userId = await promptSelectUser(
        users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
        }))
      );

      const user = users.find((u) => u.id === userId);
      if (!user) {
        showError('User not found');
        return;
      }

      const details = `(${user.name}, ${user.role})`;
      console.log(`\n  ${pc.cyan('Editing')} ${pc.bold(user.email)} ${pc.dim(details)}\n`);

      const changes = await promptEditUser({
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      });

      const hasChanges =
        changes.name || changes.role || changes.isActive !== undefined || changes.resetPassword;

      if (!hasChanges) {
        console.log(`\n${pc.dim('No changes made')}\n`);
        return;
      }

      const updated = userService.updateUser(user.id, {
        name: changes.name,
        role: changes.role ? (changes.role as Role) : undefined,
        isActive: changes.isActive,
      });

      if (changes.resetPassword) {
        await userService.setPassword(user.id, changes.resetPassword);
      }

      showSuccess('User updated!', {
        Email: updated.email,
        Name: updated.name,
        Role: pc.bold(updated.role),
        Status: updated.isActive ? pc.green('active') : pc.red('disabled'),
        ...(changes.resetPassword
          ? {
              Password: pc.green('reset'),
            }
          : {}),
      });

      printDatabaseInfo();
    } catch (error: unknown) {
      if (error instanceof CliError) {
        showError(error.message);
      } else if (error instanceof Error) {
        showError(error.message);
      } else {
        throw error;
      }
      process.exit(1);
    } finally {
      cli.stop();
    }
  },
});
