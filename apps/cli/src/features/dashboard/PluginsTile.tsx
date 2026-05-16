import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  Kbd,
  StatTile,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import type { PluginListItem } from '../../shared/cli/api';
import { hotkeyFor, MAX_ROWS } from './utils';

export function PluginsTile({
  items,
  fill,
  onPress,
}: Readonly<{
  items: ReadonlyArray<PluginListItem>;
  fill: boolean;
  onPress?: () => void;
}>): React.ReactElement {
  return (
    <StatTile
      icon="▣"
      title="Plugins"
      fill={fill}
      onPress={onPress}
      status={items.length}
      footer={
        <Text dimColor>
          <Kbd>{hotkeyFor('plugins')}</Kbd> to manage
        </Text>
      }
    >
      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No plugins yet</EmptyStateTitle>
          <EmptyStateDescription>install one from the registry</EmptyStateDescription>
        </EmptyState>
      ) : (
        <Box flexDirection="column">
          {items.slice(0, MAX_ROWS).map((p) => {
            const running = p.status === 'running';
            return (
              <Box key={p.uid}>
                <Text color={running ? 'green' : 'gray'}>{running ? '▸ ' : '· '}</Text>
                <Text wrap="truncate-end">{p.displayName ?? p.name}</Text>
                <Text dimColor>{` v${p.version}`}</Text>
              </Box>
            );
          })}
          {items.length > MAX_ROWS && <Text dimColor>+ {items.length - MAX_ROWS} more</Text>}
        </Box>
      )}
    </StatTile>
  );
}
