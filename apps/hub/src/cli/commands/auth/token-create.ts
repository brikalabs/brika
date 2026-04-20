import pc from 'picocolors';
import { defineCommand } from '../../command';
import { CliError } from './errors';
import { hubFetchOk } from './hub-client';
import { promptCreateToken, promptEmail, showError, showSuccess } from './prompts';

const TOKEN_SCOPES = [
  { value: 'workflow:read', label: 'Workflow Read', hint: 'Read workflows' },
  { value: 'workflow:write', label: 'Workflow Write', hint: 'Create/edit workflows' },
  { value: 'workflow:execute', label: 'Workflow Execute', hint: 'Run workflows' },
  { value: 'plugin:read', label: 'Plugin Read', hint: 'Read plugins' },
  { value: 'plugin:install', label: 'Plugin Install', hint: 'Install plugins' },
  { value: 'user:read', label: 'User Read', hint: 'Read users' },
  { value: 'user:write', label: 'User Write', hint: 'Manage users' },
];

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
      const userEmail = await promptEmail('User email address');
      const { name: tokenName, scopes, expiresIn } = await promptCreateToken(TOKEN_SCOPES);

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
          expiresIn,
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
