/**
 * Dashboard — three side-by-side `<StatTile>`s summarising hub state,
 * the installed-plugin list, and the registered workflows.
 *
 *   ╭─ ● Hub ──── running ─╮ ╭─ ▣ Plugins ── 3 ╮ ╭─ ◆ Workflows ── 2 ╮
 *   │ pid 1234              │ │ ▸ logger v1.0   │ │ ▸ deploy idle    │
 *   │ ~/workspace           │ │ ▸ slack  v0.3   │ │ ▸ rotate stuck   │
 *   │ ─────────────────────│ │ + 1 more        │ │                  │
 *   │ ^S start  ^X stop     │ │ p to manage     │ │ w to manage      │
 *   ╰───────────────────────╯ ╰─────────────────╯ ╰──────────────────╯
 *
 * Brix lives in `<BrixHeader>` at the top of the shell — the
 * dashboard is purely data, consistently presented via `StatTile`.
 */

import { homedir } from 'node:os';
import {
  Badge,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  Kbd,
  Stack,
  StatTile,
  useBreakpoint,
  useRouter,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import {
  fetchPlugins,
  fetchWorkflows,
  type PluginListItem,
  type WorkflowSummaryDto,
} from '../../cli/hub-api';
import type { Routes } from '../routes';
import { NAV_SECTIONS } from '../sections';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const MAX_ROWS = 4;

/** Look up the current numeric hotkey for a section so the per-tile
 *  footer hints stay in sync with the nav (no more stale `p`/`w`). */
function hotkeyFor(key: string): string {
  return NAV_SECTIONS.find((s) => s.key === key)?.hotkey ?? '?';
}

export function DashboardView(): React.ReactElement {
  const plugins = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const workflows = useHubResource<WorkflowSummaryDto[]>(fetchWorkflows, []);
  const pluginItems = plugins.data ?? [];
  const workflowItems = workflows.data ?? [];

  // At md+ the tiles share row width equally (`fill`); narrower than
  // that they stack vertically and each takes its own natural height.
  const { md: horizontal } = useBreakpoint();

  // Clicking a tile drops the user straight into the matching view —
  // saves a hop through the keyboard nav for mouse users.
  const router = useRouter<Routes>();
  const goto = (name: keyof Routes) => () => router.navigate(name);

  return (
    <Stack direction={{ base: 'column', md: 'row' }} gap={1}>
      <HubTile fill={horizontal} />
      <PluginsTile items={pluginItems} fill={horizontal} onPress={goto('plugins')} />
      <WorkflowsTile items={workflowItems} fill={horizontal} onPress={goto('workflows')} />
    </Stack>
  );
}

function HubTile({ fill }: Readonly<{ fill: boolean }>): React.ReactElement {
  const cli = useCli();
  const hub = cli.hub;
  if (hub.state === 'running') {
    return (
      <StatTile
        icon="●"
        title="Hub"
        accent="success"
        fill={fill}
        status={
          <Badge variant="success" dot>
            running
          </Badge>
        }
        footer={
          <Text dimColor>
            <Kbd>^X</Kbd> stop · <Kbd>^R</Kbd> restart · <Kbd>^O</Kbd> open
          </Text>
        }
      >
        <Text>{hub.pid === null ? 'external process' : `pid ${hub.pid}`}</Text>
        <Text dimColor wrap="truncate-middle">
          {shortenPath(cli.workspace)}
        </Text>
      </StatTile>
    );
  }
  if (hub.state === 'stale') {
    return (
      <StatTile
        icon="●"
        title="Hub"
        accent="warning"
        fill={fill}
        status={
          <Badge variant="warning" dot>
            stale
          </Badge>
        }
      >
        <Text>{`pid ${hub.pid}`}</Text>
        <Text dimColor>not actually running</Text>
      </StatTile>
    );
  }
  if (hub.state === 'stopped') {
    return (
      <StatTile
        icon="◌"
        title="Hub"
        fill={fill}
        status={
          <Badge variant="secondary" dot>
            stopped
          </Badge>
        }
        footer={
          <Text dimColor>
            <Kbd>^S</Kbd> to start
          </Text>
        }
      >
        <Text dimColor>nothing watching</Text>
      </StatTile>
    );
  }
  return (
    <StatTile icon="·" title="Hub" fill={fill}>
      <Text dimColor>checking…</Text>
    </StatTile>
  );
}

function PluginsTile({
  items,
  fill,
  onPress,
}: Readonly<{
  items: ReadonlyArray<PluginListItem>;
  fill: boolean;
  onPress?: () => void;
}>): React.ReactElement {
  return (
    <StatTile
      icon="▣"
      title="Plugins"
      fill={fill}
      onPress={onPress}
      status={items.length}
      footer={
        <Text dimColor>
          <Kbd>{hotkeyFor('plugins')}</Kbd> to manage
        </Text>
      }
    >
      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No plugins yet</EmptyStateTitle>
          <EmptyStateDescription>install one from the registry</EmptyStateDescription>
        </EmptyState>
      ) : (
        <Box flexDirection="column">
          {items.slice(0, MAX_ROWS).map((p) => (
            <Box key={p.uid}>
              <Text color={p.enabled ? 'green' : 'gray'}>{p.enabled ? '▸ ' : '· '}</Text>
              <Text wrap="truncate-end">{p.displayName ?? p.name}</Text>
              <Text dimColor>{` v${p.version}`}</Text>
            </Box>
          ))}
          {items.length > MAX_ROWS && <Text dimColor>+ {items.length - MAX_ROWS} more</Text>}
        </Box>
      )}
    </StatTile>
  );
}

function WorkflowsTile({
  items,
  fill,
  onPress,
}: Readonly<{
  items: ReadonlyArray<WorkflowSummaryDto>;
  fill: boolean;
  onPress?: () => void;
}>): React.ReactElement {
  return (
    <StatTile
      icon="◆"
      title="Workflows"
      fill={fill}
      onPress={onPress}
      status={items.length}
      footer={
        <Text dimColor>
          <Kbd>{hotkeyFor('workflows')}</Kbd> to manage
        </Text>
      }
    >
      {items.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No workflows yet</EmptyStateTitle>
          <EmptyStateDescription>define one in brika.yml</EmptyStateDescription>
        </EmptyState>
      ) : (
        <Box flexDirection="column">
          {items.slice(0, MAX_ROWS).map((w) => (
            <Box key={w.id}>
              <Text color="yellow">▸ </Text>
              <Text wrap="truncate-end">{w.name ?? w.id}</Text>
              {w.state && <Text dimColor>{` ${w.state}`}</Text>}
            </Box>
          ))}
          {items.length > MAX_ROWS && <Text dimColor>+ {items.length - MAX_ROWS} more</Text>}
        </Box>
      )}
    </StatTile>
  );
}

/** Replace the leading `$HOME` with `~` so workspace paths read more
 *  naturally inside narrow tiles. Anything outside home is returned
 *  unchanged. */
function shortenPath(path: string): string {
  const home = homedir();
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}
