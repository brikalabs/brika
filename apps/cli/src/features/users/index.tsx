/**
 * Users section — list via `/api/users` + composable `<Form>` to add
 * a new user. While the Form is mounted it calls `useCaptureInput()`
 * internally so global hotkeys (s/x/r/o/etc.) stay quiet.
 */

import { Button, Heading } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { fetchUsers, type UserDto } from '../../shared/cli/api';
import { NotConnected } from '../../shared/components/NotConnected';
import { useCli } from '../../shared/hooks/useCli';
import { useHubResource } from '../../shared/hooks/useHubResource';
import { AddUserForm, postUser } from './add';
import { UserList } from './list';

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
          <AddUserForm
            onSubmit={async (values) => {
              await postUser(values);
              setAdding(false);
              list.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </Box>
      )}

      <UserList items={items} />

      <Box marginTop={1}>
        <Button
          shortcut="a"
          variant="success"
          enabled={!adding}
          autoFocus={!adding}
          onPress={() => setAdding(true)}
        >
          add user
        </Button>
      </Box>
    </Box>
  );
}
