import pc from 'picocolors';
import * as p from '@clack/prompts';
import { inject } from '@brika/di';
import { auth, UserService } from '@brika/auth/server';
import { defineCommand } from '../../command';
import { bootstrapCLI, printDatabaseInfo } from '../../bootstrap';
import { dataDir } from '../../utils/runtime';
import { CliError } from '../../errors';
import { validators, showError } from '../../auth-prompts';

export default defineCommand({
  name: 'delete',
  description: 'Delete a user',
  examples: ['brika auth user delete'],
  async handler() {
    p.intro(pc.bgRed(pc.black(' Delete User ')));

    const email = (await p.text({
      message: 'User email address',
      placeholder: 'user@example.com',
      validate: validators.email,
    })) as string;

    const confirmed = await p.confirm({
      message: `Delete user ${pc.bold(email)}? This cannot be undone.`,
      initialValue: false,
    });

    if (confirmed === false) {
      p.cancel('Operation cancelled');
      return;
    }

    const cli = await bootstrapCLI(auth({ dataDir }));

    try {
      const userService = inject(UserService);

      console.log(`\n${pc.cyan('Deleting user')} ${pc.dim(email)} …\n`);
      await userService.deleteUser(email);

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
