import { Badge, type BadgeVariant, Properties, Property } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import type { PluginListItem, PluginMetrics } from '../../../../shared/cli/api/plugins';

/**
 * Metadata + live runtime stats for the focused plugin — sits below
 * the list and matches what the web UI surfaces on its plugin row:
 * version, author/source links, PID, CPU%, memory. Receives the
 * shared metrics snapshot from the parent so we don't double-poll.
 */
export function PluginMeta({
  plugin,
  metrics,
}: Readonly<{
  plugin: PluginListItem;
  metrics: PluginMetrics | null;
}>): React.ReactElement {
  const author = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repo = typeof plugin.repository === 'string' ? plugin.repository : plugin.repository?.url;
  return (
    <Box marginTop={1} flexDirection="column">
      <Properties>
        <Property name="version">{plugin.version}</Property>
        {author ? <Property name="author">{author}</Property> : null}
        {plugin.homepage ? <Property name="homepage">{plugin.homepage}</Property> : null}
        {repo && repo !== plugin.homepage ? <Property name="repo">{repo}</Property> : null}
        <PidProperty
          pid={metrics?.pid ?? plugin.pid ?? null}
          running={plugin.status === 'running'}
        />
        {metrics?.current ? (
          <>
            <Property name="cpu">
              <CpuBadge percent={metrics.current.cpu} />
            </Property>
            <Property name="memory">{formatBytes(metrics.current.memory)}</Property>
          </>
        ) : null}
      </Properties>
    </Box>
  );
}

export function PidProperty({
  pid,
  running,
}: Readonly<{ pid: number | null; running: boolean }>): React.ReactElement | null {
  if (pid !== null) {
    return <Property name="pid">{String(pid)}</Property>;
  }
  if (running) {
    return <Property name="pid">—</Property>;
  }
  return null;
}

export function cpuVariant(percent: number): BadgeVariant {
  if (percent >= 80) {
    return 'destructive';
  }
  if (percent >= 40) {
    return 'warning';
  }
  return 'secondary';
}

export function CpuBadge({ percent }: Readonly<{ percent: number }>): React.ReactElement {
  return <Badge variant={cpuVariant(percent)}>{`${percent.toFixed(1)}%`}</Badge>;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
