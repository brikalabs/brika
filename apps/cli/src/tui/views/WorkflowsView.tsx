/**
 * Workflows section — list, inspect, retry. Stubbed for this PR;
 * depends on /api/workflows from the hub.
 */

import { BrixSay } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function WorkflowsView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Workflows </Text>
        <Text dimColor>{cli.workflows.length}</Text>
      </Box>
      {cli.workflows.length === 0 ? (
        <BrixSay
          mood="curious"
          orient="above"
          text="no workflows yet — they'll land once the hub exposes /api/workflows"
        />
      ) : (
        <Box flexDirection="column">
          {cli.workflows.map((w) => (
            <Box key={w.id}>
              <Text>▸ {w.name} </Text>
              <Text dimColor>{w.state}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>enter inspect · r retry · backspace back</Text>
      </Box>
    </Box>
  );
}
