/**
 * Shared "hub isn't running" placeholder rendered by views that
 * require the hub to be up (Plugins, Workflows, Users, Logs).
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface NotConnectedProps {
  readonly title: string;
}

export function NotConnected({ title }: Readonly<NotConnectedProps>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Box marginTop={1}>
        <Text dimColor>hub isn't running — </Text>
        <Text color="yellow">Ctrl+S</Text>
        <Text dimColor> to start it.</Text>
      </Box>
    </Box>
  );
}
