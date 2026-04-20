import { inject } from '@brika/di';
import pc from 'picocolors';
import { defineCommand } from '../../command';
import { auth, UserService } from './auth-server';
import { bootstrapCLI, printDatabaseInfo } from './bootstrap';


export default defineCommand({
  name: 'list',
  description: 'List all users',
  examples: ['brika auth user list'],
  async handler() {
    const cli = await bootstrapCLI(auth());

    try {
      const userService = inject(UserService);
      const users = userService.listUsers();

      if (users.length === 0) {
        console.log(`\n${pc.dim('No users found')}\n`);
        printDatabaseInfo();
        return;
      }

      const heading = `Users (${users.length})`;
      console.log(`\n${pc.cyan(heading)}\n`);

      for (const user of users) {
        const roleColor = user.role === 'admin' ? pc.red : pc.cyan;
        console.log(
          `  ${pc.bold(user.email.padEnd(32))} ${roleColor(user.role.padEnd(10))} ${pc.dim(user.name)}`
        );
      }
      console.log();
      printDatabaseInfo();
    } finally {
      cli.stop();
    }
  },
});
