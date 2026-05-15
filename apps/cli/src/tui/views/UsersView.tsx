/**
 * Users section — list via `/api/users` + composable `<Form>` to add
 * a new user. While the Form is mounted it calls `useCaptureInput()`
 * internally so global hotkeys (s/x/r/o/etc.) stay quiet.
 */

import {
  Badge,
  Button,
  compose,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  email,
  Form,
  FormField,
  FormInput,
  FormPassword,
  FormSelect,
  FormSubmitError,
  type FormValues,
  Heading,
  minLength,
  required,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { fetchUsers, type UserDto } from '../../cli/hub-api';
import { hubFetch } from '../../cli/hub-client';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User', hint: 'regular access' },
  { value: 'admin', label: 'Admin', hint: 'full control' },
];

export function UsersView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<UserDto[]>(fetchUsers, []);
  const [adding, setAdding] = useState(false);

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Users" />;
  }

  const items = list.data ?? [];
  const errorLabel = list.error?.includes('401') ? 'admin login required' : list.error;

  return (
    <Box flexDirection="column">
      <Heading
        subtitle={list.loading ? `${items.length} · loading…` : `${items.length} total`}
        meta={errorLabel ? <Text color="red">{errorLabel}</Text> : null}
      >
        Users
      </Heading>

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
            <FormField name="name" label="Full name" validate={required()}>
              <FormInput placeholder="Ada Lovelace" />
            </FormField>
            <FormField name="email" label="Email" validate={compose(required(), email())}>
              <FormInput placeholder="ada@example.com" />
            </FormField>
            <FormField name="role" label="Role" initialValue="user">
              <FormSelect options={ROLE_OPTIONS} />
            </FormField>
            <FormField
              name="password"
              label="Password"
              validate={compose(required(), minLength(8))}
            >
              <FormPassword />
            </FormField>
          </Form>
        </Box>
      )}

      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No users to show</EmptyStateTitle>
          <EmptyStateDescription>
            Admin login required for non-empty lists. Press <Text bold>a</Text> to add one.
          </EmptyStateDescription>
        </EmptyState>
      ) : (
        <Box flexDirection="column">
          {items.map((u) => (
            <Box key={u.id}>
              <Text>▸ {u.email.padEnd(32)} </Text>
              <Badge variant={u.role === 'admin' ? 'destructive' : 'info'}>{u.role}</Badge>
              <Text dimColor> {u.name}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Button shortcut="a" variant="success" enabled={!adding} onPress={() => setAdding(true)}>
          add user
        </Button>
      </Box>
    </Box>
  );
}

async function postUser(values: FormValues): Promise<void> {
  const res = await hubFetch('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(values),
  });
  if (res.ok) {
    return;
  }
  const body = await res.text();
  // Map known server failures onto the offending field so the form
  // keeps the entered values and highlights the row that needs fixing.
  if (res.status === 409) {
    throw new FormSubmitError('could not add user', {
      fields: { email: 'already in use' },
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('admin login required');
  }
  throw new Error(`${res.status} ${body}`);
}
