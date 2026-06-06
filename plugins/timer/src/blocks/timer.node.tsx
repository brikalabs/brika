/**
 * Timer block node-body view.
 *
 * Shows the configured name and duration on the canvas node so the one-shot
 * timer reads at a glance without opening the config panel.
 */

import { useBlockConfig } from '@brika/sdk/block-views';
import { Timer } from 'lucide-react';

interface TimerConfig {
  name?: string;
  duration?: number;
}

function formatDuration(ms: number): string {
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
    return `${ms / 3_600_000}h`;
  }
  if (ms >= 60_000 && ms % 60_000 === 0) {
    return `${ms / 60_000}m`;
  }
  if (ms >= 1000 && ms % 1000 === 0) {
    return `${ms / 1000}s`;
  }
  return `${ms}ms`;
}

export default function TimerNode() {
  const config = useBlockConfig<TimerConfig>();
  const duration = config.duration ?? 60_000;

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
        <Timer className="size-4.5" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate font-medium text-foreground text-sm">{config.name ?? 'timer'}</p>
        <p className="font-mono text-muted-foreground text-xs tabular-nums">
          {formatDuration(duration)}
        </p>
      </div>
    </div>
  );
}
