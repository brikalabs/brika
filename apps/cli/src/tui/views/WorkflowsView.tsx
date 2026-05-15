/**
 * Workflows section — list view backed by `/api/workflows`. Enable /
 * disable hooks land in a follow-up once we settle the workflow
 * scheduler's API; for now this is a faithful read-only mirror.
 */

import { EmptyState, EmptyStateDescription, EmptyStateTitle, Heading } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { fetchWorkflows, type WorkflowSummaryDto } from '../../cli/hub-api';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

export function WorkflowsView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<WorkflowSummaryDto[]>(fetchWorkflows, []);
  const items = list.data ?? [];

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Workflows" />;
  }

  return (
    <Box flexDirection="column">
      <Heading
        subtitle={list.loading ? `${items.length} · loading…` : `${items.length} total`}
        meta={list.error ? <Text color="red">{list.error}</Text> : null}
      >
        Workflows
      </Heading>

      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No workflows defined yet</EmptyStateTitle>
          <EmptyStateDescription>
            Define workflows in `brika.yml` or via a plugin contribution.
          </EmptyStateDescription>
        </EmptyState>
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
