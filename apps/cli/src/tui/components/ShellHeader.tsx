/**
 * Top strip of the brika TUI — wordmark, version, and a live
 * hub-status pill on the right. Brix doesn't live here; he lives
 * in the footer (see <BrixHost>) so the chrome only paints one
 * mascot at a time.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function ShellHeader(): React.ReactElement {
  const cli = useCli();
  const { hub } = cli;
  return (
    <Box paddingX={1}>
      <Text bold>▰▰ Brika Runtime </Text>
      <Text dimColor>v{cli.version}</Text>
      <Box flexGrow={1} />
      <HubPill />
    </Box>
  );

  function HubPill(): React.ReactElement {
    if (hub.state === 'running') {
      return (
        <Text>
          <Text color="green" bold>
            ●
          </Text>
          {hub.pid === null ? (
            <Text dimColor> running (external)</Text>
          ) : (
            <>
              <Text dimColor> running pid </Text>
              <Text>{hub.pid}</Text>
            </>
          )}
        </Text>
      );
    }
    if (hub.state === 'stale') {
      return (
        <Text>
          <Text color="yellow">●</Text>
          <Text dimColor> stale pid </Text>
          <Text>{hub.pid}</Text>
        </Text>
      );
    }
    if (hub.state === 'stopped') {
      return (
        <Text>
          <Text dimColor>◌ stopped</Text>
        </Text>
      );
    }
    return <Text dimColor>checking…</Text>;
  }
}
