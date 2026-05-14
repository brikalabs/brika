/**
 * Dashboard — the landing section of the brika TUI. Renders three
 * cards (Hub / Plugins / Workflows) populated from the hub's HTTP
 * API. Hub control happens through the global shell keybinds (`s` /
 * `x` / `r` / `o`); the dashboard itself is read-only.
 *
 * Brix is NOT painted here — he lives in the shell footer
 * (<BrixHost>). Views narrate by setting `mood` + `statusText`
 * through <CliProvider>; the chrome owns the face.
 */

import { Card } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import {
  fetchPlugins,
  fetchWorkflows,
  type PluginListItem,
  type WorkflowSummaryDto,
} from '../../cli/hub-api';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

export function DashboardView(): React.ReactElement {
  const cli = useCli();
  const plugins = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const workflows = useHubResource<WorkflowSummaryDto[]>(fetchWorkflows, []);
  const pluginItems = plugins.data ?? [];
  const workflowItems = workflows.data ?? [];

  return (
    <Box gap={1}>
      <Card title="Hub" accent="cyan">
        <HubBody cli={cli} />
      </Card>
      <Card title="Plugins" accent="magenta" tag={String(pluginItems.length)}>
        <PluginsBody items={pluginItems} />
      </Card>
      <Card title="Workflows" accent="yellow" tag={String(workflowItems.length)}>
        <WorkflowsBody items={workflowItems} />
      </Card>
    </Box>
  );
}

function HubBody({ cli }: Readonly<{ cli: ReturnType<typeof useCli> }>): React.ReactElement {
  const hub = cli.hub;
  if (hub.state === 'running') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="green" bold>
            ●
          </Text>
          <Text> running</Text>
        </Box>
        <Text dimColor>pid {hub.pid}</Text>
        <Text dimColor>{cli.workspace}</Text>
      </Box>
    );
  }
  if (hub.state === 'stale') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">stale pid {hub.pid}</Text>
        <Text dimColor>not actually running</Text>
      </Box>
    );
  }
  if (hub.state === 'stopped') {
    return (
      <Box flexDirection="column">
        <Text color="gray">stopped</Text>
        <Text dimColor>Ctrl+S to start</Text>
      </Box>
    );
  }
  return <Text dimColor>checking…</Text>;
}

function PluginsBody({
  items,
}: Readonly<{ items: ReadonlyArray<PluginListItem> }>): React.ReactElement {
  if (items.length === 0) {
    return <Text dimColor>(none yet — press p)</Text>;
  }
  return (
    <Box flexDirection="column">
      {items.slice(0, 4).map((p) => (
        <Box key={p.uid}>
          <Text>{p.enabled ? '▸' : '·'} </Text>
          <Text>{p.displayName ?? p.name}</Text>
          <Text dimColor> v{p.version}</Text>
        </Box>
      ))}
      {items.length > 4 && <Text dimColor>… +{items.length - 4} more</Text>}
    </Box>
  );
}

function WorkflowsBody({
  items,
}: Readonly<{ items: ReadonlyArray<WorkflowSummaryDto> }>): React.ReactElement {
  if (items.length === 0) {
    return <Text dimColor>(none yet — press w)</Text>;
  }
  return (
    <Box flexDirection="column">
      {items.slice(0, 4).map((w) => (
        <Box key={w.id}>
          <Text>▸ {w.name ?? w.id} </Text>
          {w.state && <Text dimColor>{w.state}</Text>}
        </Box>
      ))}
      {items.length > 4 && <Text dimColor>… +{items.length - 4} more</Text>}
    </Box>
  );
}
