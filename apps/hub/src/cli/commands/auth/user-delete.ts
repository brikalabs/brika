import { inject } from '@brika/di';
import pc from 'picocolors';
import { defineCommand } from '../../command';
import { auth, UserService } from './auth-server';
import { bootstrapCLI, printDatabaseInfo } from './bootstrap';
import { CliError } from './errors';
import { promptDeleteUser, promptEmail, showError } from './prompts';


export default defineCommand({
  name: 'delete',
  description: 'Delete a user',
  examples: ['brika auth user delete'],
  async handler() {
    const email = await promptEmail('User email address');
    const confirmed = await promptDeleteUser(email);

    if (!confirmed) {
      return;
    }

    const cli = await bootstrapCLI(auth());

    try {
      const userService = inject(UserService);

      console.log(`\n${pc.cyan('Deleting user')} ${pc.dim(email)} …\n`);
      userService.deleteUser(email);

      console.log(`${pc.green('✓')} User deleted successfully!`);
      printDatabaseInfo();
    } catch (error: unknown) {
      if (error instanceof CliError) {
        showError(error.message);
      } else if (error instanceof Error) {
        showError(error.message.includes('not found') ? 'User not found' : error.message);
      } else {
        throw error;
      }
      process.exit(1);
    } finally {
      cli.stop();
    }
  },
});
