import { Role } from '@brika/auth';
import { inject } from '@brika/di';
import { auth, UserService } from './auth-server';
import pc from 'picocolors';
import { promptAddUser, showError, showSuccess } from './prompts';
import { bootstrapCLI, printDatabaseInfo } from './bootstrap';
import { defineCommand } from '../../command';
import { dataDir } from '../../utils/runtime';

export default defineCommand({
  name: 'add',
  description: 'Add a new user',
  examples: ['brika auth user add'],
  async handler() {
    const cli = await bootstrapCLI(
      auth({
        dataDir,
      })
    );

    try {
      const userService = inject(UserService);
      const { email, name, role, password } = await promptAddUser();

      const user = userService.createUser(email, name, (role as Role) ?? Role.USER);
      await userService.setPassword(user.id, password);

      showSuccess('User created!', {
        Email: user.email,
        Name: user.name,
        Role: pc.bold(user.role),
      });
      printDatabaseInfo();
    } catch (error: unknown) {
      if (error instanceof Error) {
        const msg = error.message.includes('UNIQUE constraint failed')
          ? 'User already exists'
          : error.message;
        showError(msg);
      } else {
        throw error;
      }
      process.exit(1);
    } finally {
      cli.stop();
    }
  },
});
