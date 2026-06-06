/**
 * Timer block config view.
 *
 * Owns the whole config panel: a name field plus a visual duration builder
 * (number + unit, with quick presets). The duration is always persisted in
 * milliseconds via the merge-patch update hook.
 */

import { useBlockConfig, useUpdateBlockConfig } from '@brika/sdk/block-views';
import { Input, Label } from '@brika/sdk/ui-kit';
import { Tag, Timer } from 'lucide-react';
import { DurationBuilder } from './_duration-builder';

interface TimerConfig {
  name?: string;
  duration?: number;
}

const PRESETS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '10m', ms: 600_000 },
  { label: '1h', ms: 3_600_000 },
];

export default function TimerView() {
  const config = useBlockConfig<TimerConfig>();
  const update = useUpdateBlockConfig();
  const duration = config.duration ?? 60_000;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-500">
        <Timer className="size-4" />
        <span className="font-medium text-foreground text-sm">Timer</span>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Tag className="size-3" />
          Name
        </Label>
        <Input
          value={config.name ?? ''}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="timer"
          className="bg-background"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Duration</Label>
        <DurationBuilder
          value={duration}
          presets={PRESETS}
          onChange={(ms) => update({ duration: ms })}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Fires once on <span className="font-medium text-foreground">Trigger</span>, then emits{' '}
        <span className="font-medium text-foreground">Completed</span> after the duration.
      </p>
    </div>
  );
}
