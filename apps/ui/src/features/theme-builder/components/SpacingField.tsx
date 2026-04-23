/**
 * SpacingField — slider + density presets. Real effects of `--spacing`
 * on actual components are shown by the main preview canvas on the
 * right; this field only exposes the raw scale.
 */

import { Slider } from '@/components/ui';
import { nearlyEquals, type Preset, PresetChips } from './primitives';

interface SpacingFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const DENSITY_PRESETS: readonly Preset<number>[] = [
  { label: 'Compact', value: 0.2, hint: 'Tight padding, dense UI' },
  { label: 'Cozy', value: 0.225, hint: 'Slightly tighter than default' },
  { label: 'Default', value: 0.25, hint: 'Standard density' },
  { label: 'Roomy', value: 0.3, hint: 'Extra breathing room' },
];

const DENSITY_TICKS = DENSITY_PRESETS.map((p) => p.value);
const DENSITY_EQUALS = nearlyEquals(0.003);

export function SpacingField({ value, onChange }: Readonly<SpacingFieldProps>) {
  return (
    <div className="space-y-2.5">
      <Slider
        value={value}
        onChange={onChange}
        min={0.15}
        max={0.35}
        step={0.005}
        unit="rem"
        numericWidth="w-12"
        ticks={DENSITY_TICKS}
      />

      <PresetChips
        presets={DENSITY_PRESETS}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={DENSITY_EQUALS}
      />
    </div>
  );
}
