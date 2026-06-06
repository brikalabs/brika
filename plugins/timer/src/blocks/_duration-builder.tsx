/**
 * Shared visual duration builder used by the timer and countdown config views.
 *
 * Renders a number input paired with a unit toggle (ms / sec / min / hr) plus a
 * row of quick presets. The value is always expressed in milliseconds; presets
 * are passed in by each view so they can differ per use (total duration vs tick
 * interval).
 */

import { Button, Input, ToggleGroup, ToggleGroupItem } from '@brika/sdk/ui-kit';
import { useState } from 'react';

interface DurationUnit {
  id: string;
  label: string;
  ms: number;
}

const UNITS: readonly DurationUnit[] = [
  { id: 'ms', label: 'ms', ms: 1 },
  { id: 's', label: 'sec', ms: 1000 },
  { id: 'm', label: 'min', ms: 60_000 },
  { id: 'h', label: 'hr', ms: 3_600_000 },
];

function pickUnit(ms: number): DurationUnit {
  const ordered = [...UNITS].reverse();
  const fit = ordered.find((u) => ms >= u.ms && ms % u.ms === 0);
  return fit ?? UNITS[1];
}

interface DurationBuilderProps {
  value: number;
  presets: ReadonlyArray<{ label: string; ms: number }>;
  onChange: (ms: number) => void;
}

export function DurationBuilder({ value, presets, onChange }: Readonly<DurationBuilderProps>) {
  const [unitId, setUnitId] = useState<string>(() => pickUnit(value).id);
  const unit = UNITS.find((u) => u.id === unitId) ?? UNITS[1];
  const amount = value / unit.ms;

  const commit = (nextAmount: number, nextUnit: DurationUnit) => {
    const ms = Math.max(0, Math.round(nextAmount * nextUnit.ms));
    onChange(ms);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={Number.isFinite(amount) ? String(amount) : ''}
          onChange={(e) => commit(Number(e.target.value), unit)}
          className="bg-background font-mono"
        />
        <ToggleGroup
          type="single"
          value={unitId}
          onValueChange={(next) => {
            if (next) {
              setUnitId(next);
            }
          }}
          className="shrink-0"
        >
          {UNITS.map((u) => (
            <ToggleGroupItem key={u.id} value={u.id} className="px-2.5 text-xs">
              {u.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = preset.ms === value;
          return (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              onClick={() => {
                setUnitId(pickUnit(preset.ms).id);
                onChange(preset.ms);
              }}
              className="h-7 px-2.5 text-xs"
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
