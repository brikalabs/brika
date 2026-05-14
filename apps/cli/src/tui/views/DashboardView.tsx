/**
 * Default `brika` landing screen. Renders the Brix header, three
 * cards (hub / plugins / workflows), a log preview, and a Brix
 * statusline keyed off the hub's current mood.
 *
 * Keybinds (live):
 *   q / Ctrl+C   quit
 *
 * Drill-down keys (`l`, `p`, `w`, `?`) are reserved — wired in #9.
 */

import { BrixHeader, BrixStatusline, BrixTalking, TAGLINE } from '@brika/brix';
import { Card, Kbd, useKey, useTuiShell } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { useCli } from '../useCli';

export function DashboardView(): React.ReactElement {
  const { onQuit } = useTuiShell();
  const cli = useCli();
  const [greetingDone, setGreetingDone] = useState(false);

  useKey('q', () => onQuit());
  useKey('ctrl+c', () => onQuit());

  return (
    <Box flexDirection="column" padding={1}>
      <BrixHeader
        version={cli.version}
        workspace={cli.workspace}
        plugins={cli.plugins.length}
        workflows={cli.workflows.length}
        status={statusLabel(cli)}
        mood={cli.mood}
      />

      <Box marginTop={1}>
        {greetingDone ? (
          <BrixStatusline mood={cli.mood} text={statusNarration(cli)} />
        ) : (
          <BrixTalking
            mood="default"
            mode="typewriter"
            text={`{:idle:}hello — i'm brix. {:thinking:}${TAGLINE}`}
            onDone={() => setGreetingDone(true)}
          />
        )}
      </Box>

      <Box marginTop={1} gap={1}>
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

      <Box marginTop={1}>
        <Footer />
      </Box>
    </Box>
  );
}

function statusLabel(cli: ReturnType<typeof useCli>): string {
  switch (cli.hub.state) {
    case 'running':
      return 'watching';
    case 'stopped':
      return 'stopped';
    case 'stale':
      return 'stale pid';
    case 'unknown':
      return 'checking…';
  }
}

function statusNarration(cli: ReturnType<typeof useCli>): string {
  switch (cli.hub.state) {
    case 'running':
      return 'watching workflows';
    case 'stopped':
      return 'hub is sleeping — `brika start` to wake it';
    case 'stale':
      return 'pid file is stale — run `brika status` to clear';
    case 'unknown':
      return 'checking hub status…';
  }
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
        <Text dimColor>brika start</Text>
      </Box>
    );
  }
  return <Text dimColor>checking…</Text>;
}

function PluginsBody({ cli }: Readonly<{ cli: ReturnType<typeof useCli> }>): React.ReactElement {
  if (cli.plugins.length === 0) {
    return <Text dimColor>none loaded yet</Text>;
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
    return <Text dimColor>none defined yet</Text>;
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

function Footer(): React.ReactElement {
  return (
    <Box>
      <Kbd>q</Kbd>
      <Text dimColor> quit </Text>
      <Kbd>l</Kbd>
      <Text dimColor> logs </Text>
      <Kbd>p</Kbd>
      <Text dimColor> plugins </Text>
      <Kbd>w</Kbd>
      <Text dimColor> workflows </Text>
      <Kbd>?</Kbd>
      <Text dimColor> help</Text>
    </Box>
  );
}
