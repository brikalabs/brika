/**
 * Users section — list via `/api/users` + composable `<Form>` to add
 * a new user. While the Form is mounted it calls `useCaptureInput()`
 * internally so global hotkeys (s/x/r/o/etc.) stay quiet.
 */

import {
  Form,
  FormField,
  FormInput,
  FormPassword,
  FormSelect,
  type FormValues,
  useKey,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { fetchUsers, type UserDto } from '../../cli/hub-api';
import { hubFetch } from '../../cli/hub-client';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User', hint: 'regular access' },
  { value: 'admin', label: 'Admin', hint: 'full control' },
];

const required = (v: string | boolean): string | null =>
  typeof v === 'string' && v.trim().length === 0 ? 'this field is required' : null;

const emailish = (v: string | boolean): string | null =>
  typeof v === 'string' && /^.+@.+\..+/.test(v) ? null : 'looks like that email is malformed';

const minLen =
  (n: number) =>
  (v: string | boolean): string | null =>
    typeof v === 'string' && v.length >= n ? null : `must be at least ${n} characters`;

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
          <Text dimColor>hub isn't running — </Text>
          <Text color="yellow">Ctrl+S</Text>
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
          <Form
            title="Add user"
            subtitle="Esc to cancel any step"
            onSubmit={async (values) => {
              await postUser(values);
              setAdding(false);
              list.refresh();
            }}
            onCancel={() => setAdding(false)}
          >
            <FormField name="name" label="Full name" validate={required}>
              <FormInput placeholder="Ada Lovelace" />
            </FormField>
            <FormField name="email" label="Email" validate={emailish}>
              <FormInput placeholder="ada@example.com" />
            </FormField>
            <FormField name="role" label="Role" initialValue="user">
              <FormSelect options={ROLE_OPTIONS} />
            </FormField>
            <FormField
              name="password"
              label="Password"
              validate={minLen(8)}
              summarize={(v) => '•'.repeat(typeof v === 'string' ? v.length : 0)}
            >
              <FormPassword />
            </FormField>
          </Form>
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

async function postUser(values: FormValues): Promise<void> {
  const res = await hubFetch('/api/users/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
}
