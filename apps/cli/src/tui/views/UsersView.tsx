/**
 * Users section — list/add/edit/delete users + API tokens. Stubbed
 * for this PR; depends on the hub's auth HTTP endpoints.
 */

import { BrixSay } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function UsersView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Users </Text>
        <Text dimColor>{cli.users.length}</Text>
      </Box>
      {cli.users.length === 0 ? (
        <BrixSay
          mood="curious"
          orient="above"
          text="user list will land once we wire the hub's auth HTTP endpoints"
        />
      ) : (
        <Box flexDirection="column">
          {cli.users.map((u) => (
            <Box key={u.id}>
              <Text>▸ {u.name} </Text>
              <Text dimColor>{u.role}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>a add · e edit · t tokens · backspace back</Text>
      </Box>
    </Box>
  );
}
