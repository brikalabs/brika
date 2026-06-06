/**
 * Countdown block config view.
 *
 * Owns the whole config panel: a visual duration builder for the total
 * countdown plus a tick-interval builder controlling how often progress ticks
 * are emitted. Both values are persisted in milliseconds via the merge-patch
 * update hook.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import { Label } from '@brika/sdk/ui-kit';
import { Clock, Repeat } from 'lucide-react';
import { DurationBuilder } from './_duration-builder';

interface CountdownConfig {
  duration?: number;
  tickInterval?: number;
}

const DURATION_PRESETS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '10m', ms: 600_000 },
  { label: '1h', ms: 3_600_000 },
];

const TICK_PRESETS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '250ms', ms: 250 },
  { label: '500ms', ms: 500 },
  { label: '1s', ms: 1000 },
  { label: '5s', ms: 5000 },
];

export default function CountdownView() {
  const config = useBlockConfig<CountdownConfig>();
  const update = useUpdateBlockConfig();
  const duration = config.duration ?? 60_000;
  const tickInterval = config.tickInterval ?? 1000;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-blue-500">
        <Clock className="size-4" />
        <span className="font-medium text-foreground text-sm">Countdown</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Total duration</Label>
        <DurationBuilder
          value={duration}
          presets={DURATION_PRESETS}
          onChange={(ms) => update({ duration: ms })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Repeat className="size-3" />
          Tick interval
        </Label>
        <DurationBuilder
          value={tickInterval}
          presets={TICK_PRESETS}
          onChange={(ms) => update({ tickInterval: Math.max(1, ms) })}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Emits a <span className="font-medium text-foreground">Tick</span> every interval with
        remaining time and progress, then{' '}
        <span className="font-medium text-foreground">Completed</span>.
      </p>
    </div>
  );
}
