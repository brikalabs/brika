/**
 * Interactive prompts for auth CLI commands
 * Uses @clack/prompts for beautiful, user-friendly input
 */

import { EmailSchema, NameSchema, validatePassword } from '@brika/auth';
import * as p from '@clack/prompts';
import pc from 'picocolors';

/** Zod-based validators for @clack/prompts */
export const validators = {
  email: (value: string | undefined): string | undefined => {
    const result = EmailSchema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  },
  name: (value: string | undefined): string | undefined => {
    const result = NameSchema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  },
  password: (value: string | undefined): string | undefined => validatePassword(value ?? ''),
};

/**
 * Prompt for new user creation (unified flow with role + password)
 */
export async function promptAddUser(): Promise<{
  email: string;
  name: string;
  role: string;
  password: string;
}> {
  p.intro(pc.bgCyan(pc.black(' Create New User ')));

  const answers = await p.group(
    {
      email: () =>
        p.text({
          message: 'Email address',
          placeholder: 'user@example.com',
          validate: validators.email,
        }),
      name: () =>
        p.text({
          message: 'Display name',
          placeholder: 'John',
          validate: validators.name,
        }),
      role: () =>
        p.select({
          message: 'Role',
          options: [
            {
              value: 'admin',
              label: 'Admin',
              hint: 'Full access',
            },
            {
              value: 'user',
              label: 'User',
              hint: 'Standard user',
            },
            {
              value: 'guest',
              label: 'Guest',
              hint: 'Limited access',
            },
            {
              value: 'service',
              label: 'Service',
              hint: 'API access',
            },
          ],
          initialValue: 'user',
        }),
      password: () =>
        p.password({
          message: 'Password',
          validate: validators.password,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled');
        process.exit(0);
      },
    }
  );

  return {
    email: String(answers.email).toLowerCase(),
    name: String(answers.name),
    role: String(answers.role),
    password: String(answers.password),
  };
}

/**
 * Prompt to select a user from a list
 */
export async function promptSelectUser(
  users: {
    id: string;
    email: string;
    name: string;
    role: string;
  }[]
): Promise<string> {
  const selected = await p.select({
    message: 'Select a user',
    options: users.map((u) => ({
      value: u.id,
      label: u.email,
      hint: `${u.name} (${u.role})`,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  return selected as string;
}

/**
 * Prompt to edit user fields (shows current values, lets user change)
 */
export async function promptEditUser(user: {
  name: string;
  role: string;
  isActive: boolean;
}): Promise<{
  name?: string;
  role?: string;
  isActive?: boolean;
  resetPassword?: string;
}> {
  const actions = (await p.multiselect({
    message: 'What do you want to change?',
    options: [
      {
        value: 'name',
        label: 'Display name',
        hint: user.name,
      },
      {
        value: 'role',
        label: 'Role',
        hint: user.role,
      },
      {
        value: 'active',
        label: 'Active status',
        hint: user.isActive ? 'active' : 'disabled',
      },
      {
        value: 'password',
        label: 'Reset password',
      },
    ],
  })) as string[];

  if (p.isCancel(actions)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const result: {
    name?: string;
    role?: string;
    isActive?: boolean;
    resetPassword?: string;
  } = {};

  if (actions.includes('name')) {
    const name = await p.text({
      message: 'New display name',
      initialValue: user.name,
      validate: validators.name,
    });
    if (p.isCancel(name)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    result.name = name as string;
  }

  if (actions.includes('role')) {
    const role = await p.select({
      message: 'New role',
      options: [
        {
          value: 'admin',
          label: 'Admin',
          hint: 'Full access',
        },
        {
          value: 'user',
          label: 'User',
          hint: 'Standard user',
        },
        {
          value: 'guest',
          label: 'Guest',
          hint: 'Limited access',
        },
        {
          value: 'service',
          label: 'Service',
          hint: 'API access',
        },
      ],
      initialValue: user.role,
    });
    if (p.isCancel(role)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    result.role = role as string;
  }

  if (actions.includes('active')) {
    const active = await p.confirm({
      message: 'User active?',
      initialValue: user.isActive,
    });
    if (p.isCancel(active)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    result.isActive = active;
  }

  if (actions.includes('password')) {
    const password = await p.password({
      message: 'New password',
      validate: validators.password,
    });
    if (p.isCancel(password)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    result.resetPassword = password as string;
  }

  return result;
}

/**
 * Prompt for user deletion confirmation
 */
export async function promptDeleteUser(email: string): Promise<boolean> {
  const confirmed = await p.confirm({
    message: `Delete user ${pc.bold(email)}? This cannot be undone.`,
    initialValue: false,
  });

  if (confirmed === false) {
    p.cancel('Operation cancelled');
    return false;
  }

  return true;
}

/**
 * Prompt for email (reusable for any flow)
 */
export async function promptEmail(message = 'Email address'): Promise<string> {
  const email = (await p.text({
    message,
    placeholder: 'user@example.com',
    validate: validators.email,
  })) as string;

  return email.toLowerCase();
}

/**
 * Prompt for scope/permission selection
 */
export async function promptSelectScopes(
  availableScopes: {
    value: string;
    label: string;
    hint?: string;
  }[]
): Promise<string[]> {
  const selected = await p.multiselect({
    message: 'Select scopes (permissions)',
    options: availableScopes,
    required: true,
  });

  if (!selected || p.isCancel(selected) || selected.length === 0) {
    p.cancel('No scopes selected');
    process.exit(0);
  }

  return selected as string[];
}

/**
 * Prompt for API token creation
 */
export async function promptCreateToken(
  availableScopes: {
    value: string;
    label: string;
    hint?: string;
  }[]
): Promise<{
  name: string;
  scopes: string[];
  expiresIn?: number;
}> {
  p.intro(pc.bgCyan(pc.black(' Create API Token ')));

  const answers = await p.group(
    {
      name: () =>
        p.text({
          message: 'Token name',
          placeholder: 'my-integration',
          validate: (value) => (value ? undefined : 'Token name is required'),
        }),
      scopes: () =>
        p.multiselect({
          message: 'Select scopes (permissions)',
          options: availableScopes,
          required: true,
        }),
      expiresIn: () =>
        p.select({
          message: 'Token expiration',
          options: [
            {
              value: 0,
              label: 'Never',
              hint: 'No expiration',
            },
            {
              value: 7 * 24 * 60 * 60,
              label: '7 days',
            },
            {
              value: 30 * 24 * 60 * 60,
              label: '30 days',
            },
            {
              value: 90 * 24 * 60 * 60,
              label: '90 days',
            },
            {
              value: 365 * 24 * 60 * 60,
              label: '1 year',
            },
          ],
          initialValue: 30 * 24 * 60 * 60,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled');
        process.exit(0);
      },
    }
  );

  return {
    name: String(answers.name),
    scopes: Array.from(answers.scopes),
    expiresIn: Number(answers.expiresIn),
  };
}

/**
 * Show success message with formatted data
 */
export function showSuccess(title: string, data: Record<string, unknown>): void {
  console.log(`\n${pc.green('✓')} ${title}\n`);
  for (const [key, value] of Object.entries(data)) {
    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
    const label = `${formattedKey}:`;
    console.log(`  ${pc.dim(label)}  ${value}`);
  }
}

/**
 * Show error message
 */
export function showError(message: string): void {
  console.log(`\n${pc.red('✗')} ${message}\n`);
}
