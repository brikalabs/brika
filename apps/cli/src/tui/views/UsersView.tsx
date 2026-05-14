/**
 * Users section — list via `/api/users` + clack-style Wizard to add
 * a new user. While the Wizard is open it captures input via
 * `useCaptureInput()` so global hotkeys (s/x/r/o/etc.) stay quiet.
 */

import { useKey } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { fetchUsers, type UserDto } from '../../cli/hub-api';
import { hubFetch } from '../../cli/hub-client';
import { Wizard, type WizardStep, type WizardValues } from '../components/Wizard';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const ADD_USER_STEPS: ReadonlyArray<WizardStep> = [
  {
    name: 'name',
    kind: 'text',
    label: 'Full name',
    placeholder: 'Ada Lovelace',
    validate: (v) => (v.trim().length === 0 ? 'name is required' : null),
  },
  {
    name: 'email',
    kind: 'text',
    label: 'Email',
    placeholder: 'ada@example.com',
    validate: (v) => (/^.+@.+\..+/.test(v) ? null : 'looks like that email is malformed'),
  },
  {
    name: 'role',
    kind: 'select',
    label: 'Role',
    options: [
      { value: 'user', label: 'User', hint: 'regular access' },
      { value: 'admin', label: 'Admin', hint: 'full control' },
    ],
    initial: 'user',
  },
  {
    name: 'password',
    kind: 'password',
    label: 'Password',
    validate: (v) => (v.length < 8 ? 'must be at least 8 characters' : null),
  },
];

export function UsersView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<UserDto[]>(fetchUsers, []);
  const [adding, setAdding] = useState(false);

  useKey('a', () => setAdding(true), !adding);

  if (cli.hub.state !== 'running') {
    return (
      <Box flexDirection="column">
        <Text bold>Users</Text>
        <Box marginTop={1}>
          <Text dimColor>hub isn't running — press </Text>
          <Text color="yellow">s</Text>
          <Text dimColor> to start it.</Text>
        </Box>
      </Box>
    );
  }

  const items = list.data ?? [];
  const errorLabel = list.error?.includes('401') ? 'admin login required' : list.error;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Users </Text>
        <Text dimColor>{items.length}</Text>
        {list.loading && <Text dimColor> · loading…</Text>}
        {errorLabel && <Text color="red"> · {errorLabel}</Text>}
      </Box>

      {adding && (
        <Box marginBottom={1}>
          <Wizard
            title="Add user"
            subtitle="Esc to cancel any step"
            steps={ADD_USER_STEPS}
            onSubmit={async (values) => {
              await postUser(values);
              setAdding(false);
              list.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </Box>
      )}

      {items.length === 0 ? (
        <Text dimColor>(no users to show — admin login required for non-empty lists)</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((u) => (
            <Box key={u.id}>
              <Text>▸ {u.email.padEnd(32)} </Text>
              <Text color={u.role === 'admin' ? 'red' : 'cyan'}>{u.role.padEnd(8)}</Text>
              <Text dimColor> {u.name}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>a add</Text>
      </Box>
    </Box>
  );
}

async function postUser(values: WizardValues): Promise<void> {
  const res = await hubFetch('/api/users/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
}
