import * as p from '@clack/prompts';
import pc from 'picocolors';
import { showError, showSuccess } from '../../auth-prompts';
import { defineCommand } from '../../command';
import { CliError } from '../../errors';
import { hubFetchOk } from '../../utils/hub-client';

interface CreateTokenResponse {
  token: {
    id: string;
    name: string;
    token: string;
    scopes: string[];
    createdAt: string;
    expiresAt: string | null;
  };
}

export default defineCommand({
  name: 'create',
  description: 'Create an API token for a user',
  examples: ['brika auth token create'],
  async handler() {
    try {
      p.intro(pc.bgCyan(pc.black(' Create API Token ')));

      // Prompt for user email
      const userEmail = (await p.text({
        message: 'User email address',
        placeholder: 'user@example.com',
        validate: (value) => (value ? undefined : 'Email is required'),
      })) as string;

      // Prompt for token details
      const tokenName = (await p.text({
        message: 'Token name',
        placeholder: 'my-integration',
        validate: (value) => (value ? undefined : 'Token name is required'),
      })) as string;

      // Prompt for scopes
      const scopes = (await p.multiselect({
        message: 'Select token scopes',
        options: [
          {
            value: 'workflow:read',
            label: 'Workflow Read',
            hint: 'Read workflows',
          },
          {
            value: 'workflow:write',
            label: 'Workflow Write',
            hint: 'Create/edit workflows',
          },
          {
            value: 'workflow:execute',
            label: 'Workflow Execute',
            hint: 'Run workflows',
          },
          {
            value: 'plugin:read',
            label: 'Plugin Read',
            hint: 'Read plugins',
          },
          {
            value: 'plugin:install',
            label: 'Plugin Install',
            hint: 'Install plugins',
          },
          {
            value: 'user:read',
            label: 'User Read',
            hint: 'Read users',
          },
          {
            value: 'user:write',
            label: 'User Write',
            hint: 'Manage users',
          },
        ],
        required: true,
      })) as string[];

      // Prompt for expiration
      const expiresIn = (await p.select({
        message: 'Token expiration',
        options: [
          {
            value: '0',
            label: 'Never',
            hint: 'No expiration',
          },
          {
            value: (7 * 24 * 60 * 60).toString(),
            label: '7 days',
          },
          {
            value: (30 * 24 * 60 * 60).toString(),
            label: '30 days',
          },
          {
            value: (90 * 24 * 60 * 60).toString(),
            label: '90 days',
          },
          {
            value: (365 * 24 * 60 * 60).toString(),
            label: '1 year',
          },
        ],
        initialValue: (30 * 24 * 60 * 60).toString(),
      })) as string;

      console.log(`\n${pc.cyan('Creating token')} …\n`);

      const res = await hubFetchOk('/api/auth/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail,
          name: tokenName,
          scopes,
          expiresIn: Number.parseInt(expiresIn, 10),
        }),
      });

      const data = (await res.json()) as CreateTokenResponse;

      showSuccess('API token created successfully!', {
        ID: data.token.id,
        Name: data.token.name,
        Scopes: data.token.scopes.join(', '),
        Expires: data.token.expiresAt || 'Never',
      });

      // Show the token (important: only display once!)
      console.log(`\n${pc.yellow('⚠ Token Value (store this securely):')} \n`);
      console.log(`  ${pc.bold(data.token.token)}\n`);
      console.log(`${pc.dim('Note:')} Save this token now. You won't be able to see it again!\n`);
    } catch (error: unknown) {
      if (error instanceof CliError) {
        showError(error.message);
      } else if (error instanceof Error) {
        showError(error.message);
      } else {
        throw error;
      }
      process.exit(1);
    }
  },
});
