/**
 * Top strip of the brika TUI — Brix's face, the wordmark, version,
 * and a live hub-status pill on the right. Same shape on every
 * section so the header acts as a stable anchor while you navigate.
 */

import { Brix } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function ShellHeader(): React.ReactElement {
  const cli = useCli();
  const { hub } = cli;
  return (
    <Box paddingX={1}>
      <Brix mood={cli.mood} color="cyan" />
      <Text bold> Brika Runtime </Text>
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
          <Text dimColor> running pid </Text>
          <Text>{hub.pid}</Text>
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
