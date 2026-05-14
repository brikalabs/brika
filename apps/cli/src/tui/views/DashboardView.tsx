/**
 * Dashboard — the landing section of the brika TUI. Renders three
 * cards (Hub / Plugins / Workflows) and a small recent-activity feed.
 * Hub control happens through the global shell keybinds (`s` / `x` /
 * `r` / `o`); we just show what state the hub is in.
 */

import { BrixSay, BrixTalking } from '@brika/brix';
import { Card } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useCli } from '../useCli';

export function DashboardView(): React.ReactElement {
  const cli = useCli();
  const [greetingDone, setGreetingDone] = useState(false);

  return (
    <Box flexDirection="column">
      {!greetingDone && (
        <Box marginBottom={1}>
          <BrixTalking
            mode="typewriter"
            mood="default"
            text="{:idle:}hi — i'm brix. {:thinking:}let's keep things tidy."
            onDone={() => setGreetingDone(true)}
          />
        </Box>
      )}

      <Box gap={1}>
        <Card title="Hub" accent="cyan">
          <HubBody cli={cli} />
        </Card>
        <Card title="Plugins" accent="magenta" tag={`${cli.plugins.length}`}>
          <PluginsBody cli={cli} />
        </Card>
        <Card title="Workflows" accent="yellow" tag={`${cli.workflows.length}`}>
          <WorkflowsBody cli={cli} />
        </Card>
      </Box>

      {cli.hub.state === 'stopped' && (
        <Box marginTop={1}>
          <BrixSay mood="sleep" text="hub is sleeping — press s to start" />
        </Box>
      )}
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
        <Text dimColor>press s to start</Text>
      </Box>
    );
  }
  return <Text dimColor>checking…</Text>;
}

function PluginsBody({ cli }: Readonly<{ cli: ReturnType<typeof useCli> }>): React.ReactElement {
  if (cli.plugins.length === 0) {
    return <Text dimColor>(none yet — press p)</Text>;
  }
  return (
    <Box flexDirection="column">
      {cli.plugins.slice(0, 4).map((p) => (
        <Box key={p.name}>
          <Text>{p.enabled ? '▸' : '·'} </Text>
          <Text>{p.name}</Text>
          <Text dimColor> v{p.version}</Text>
        </Box>
      ))}
      {cli.plugins.length > 4 && <Text dimColor>… +{cli.plugins.length - 4} more</Text>}
    </Box>
  );
}

function WorkflowsBody({ cli }: Readonly<{ cli: ReturnType<typeof useCli> }>): React.ReactElement {
  if (cli.workflows.length === 0) {
    return <Text dimColor>(none yet — press w)</Text>;
  }
  return (
    <Box flexDirection="column">
      {cli.workflows.slice(0, 4).map((w) => (
        <Box key={w.id}>
          <Text>▸ {w.name} </Text>
          <Text dimColor>{w.state}</Text>
        </Box>
      ))}
      {cli.workflows.length > 4 && <Text dimColor>… +{cli.workflows.length - 4} more</Text>}
    </Box>
  );
}
