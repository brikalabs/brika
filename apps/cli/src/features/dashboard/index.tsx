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

import { Stack, useBreakpoint, useRouter } from '@brika/tui';
import type React from 'react';
import {
  fetchPlugins,
  fetchWorkflows,
  type PluginListItem,
  type WorkflowSummaryDto,
} from '../../shared/cli/api';
import type { Routes } from '../../routes';
import { useHubResource } from '../../shared/hooks/useHubResource';
import { HubTile } from './HubTile';
import { PluginsTile } from './PluginsTile';
import { WorkflowsTile } from './WorkflowsTile';

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
