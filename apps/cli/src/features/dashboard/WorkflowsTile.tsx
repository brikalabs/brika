import { EmptyState, EmptyStateDescription, EmptyStateTitle, Kbd, StatTile } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import type { WorkflowSummaryDto } from '../../shared/cli/api';
import { hotkeyFor, MAX_ROWS } from './utils';

export function WorkflowsTile({
  items,
  fill,
  onPress,
}: Readonly<{
  items: ReadonlyArray<WorkflowSummaryDto>;
  fill: boolean;
  onPress?: () => void;
}>): React.ReactElement {
  return (
    <StatTile
      icon="◆"
      title="Workflows"
      fill={fill}
      onPress={onPress}
      status={items.length}
      footer={
        <Text dimColor>
          <Kbd>{hotkeyFor('workflows')}</Kbd> to manage
        </Text>
      }
    >
      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No workflows yet</EmptyStateTitle>
          <EmptyStateDescription>define one in brika.yml</EmptyStateDescription>
        </EmptyState>
      ) : (
        <Box flexDirection="column">
          {items.slice(0, MAX_ROWS).map((w) => (
            <Box key={w.id}>
              <Text color="yellow">▸ </Text>
              <Text wrap="truncate-end">{w.name ?? w.id}</Text>
              {w.state && <Text dimColor>{` ${w.state}`}</Text>}
            </Box>
          ))}
          {items.length > MAX_ROWS && <Text dimColor>+ {items.length - MAX_ROWS} more</Text>}
        </Box>
      )}
    </StatTile>
  );
}
