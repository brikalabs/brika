/**
 * Logs section — full-bleed log tail with @brika/tui's LogPane.
 * Stubbed for this PR; will read from the hub's /api/stream/logs
 * (SSE) and the logs.db (sqlite) once we wire those in.
 */

import { BrixSay } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';

export function LogsView(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Logs</Text>
      </Box>
      <BrixSay
        mood="curious"
        orient="above"
        text="log tail lands once the hub's SSE stream is wired — will use @brika/tui's LogPane + useSearch"
      />
      <Box marginTop={1}>
        <Text dimColor>/ search · l level · s source · p plugin · c clear</Text>
      </Box>
    </Box>
  );
}
