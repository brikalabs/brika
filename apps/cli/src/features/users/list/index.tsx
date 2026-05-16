import {
  Badge,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import type { UserDto } from '../../../shared/cli/api';

interface UserListProps {
  readonly items: ReadonlyArray<UserDto>;
}

export function UserList({ items }: Readonly<UserListProps>): React.ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState>
        <EmptyStateTitle>No users to show</EmptyStateTitle>
        <EmptyStateDescription>
          Admin login required for non-empty lists. Press <Text bold>a</Text> to add one.
        </EmptyStateDescription>
      </EmptyState>
    );
  }
  return (
    <Box flexDirection="column">
      {items.map((u) => (
        <Box key={u.id}>
          <Text>▸ {u.email.padEnd(32)} </Text>
          <Badge variant={u.role === 'admin' ? 'destructive' : 'info'}>{u.role}</Badge>
          <Text dimColor> {u.name}</Text>
        </Box>
      ))}
    </Box>
  );
}
