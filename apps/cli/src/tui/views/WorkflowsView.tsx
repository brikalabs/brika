/**
 * Workflows section — list view backed by `/api/workflows`. Enable /
 * disable hooks land in a follow-up once we settle the workflow
 * scheduler's API; for now this is a faithful read-only mirror.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { fetchWorkflows, type WorkflowSummaryDto } from '../../cli/hub-api';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

export function WorkflowsView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<WorkflowSummaryDto[]>(fetchWorkflows, []);
  const items = list.data ?? [];

  if (cli.hub.state !== 'running') {
    return (
      <Box flexDirection="column">
        <Text bold>Workflows</Text>
        <Box marginTop={1}>
          <Text dimColor>hub isn't running — press </Text>
          <Text color="yellow">s</Text>
          <Text dimColor> to start it.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Workflows </Text>
        <Text dimColor>{items.length}</Text>
        {list.loading && <Text dimColor> · loading…</Text>}
        {list.error && <Text color="red"> · {list.error}</Text>}
      </Box>

      {items.length === 0 ? (
        <Text dimColor>(no workflows defined yet)</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((w) => (
            <Box key={w.id}>
              <Text>{w.enabled === false ? '·' : '▸'} </Text>
              <Text>{w.name ?? w.id}</Text>
              {w.state && <Text dimColor> {w.state}</Text>}
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>(enter inspect, r retry — coming soon)</Text>
      </Box>
    </Box>
  );
}
