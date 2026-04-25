/**
 * SpacingField — slider + density presets. Real effects of `--spacing`
 * on actual components are shown by the main preview canvas on the
 * right; this field only exposes the raw scale.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider, SliderValue } from '@/components/ui';
import { nearlyEquals, type Preset, PresetChips } from './primitives';

interface SpacingFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const DENSITY_DEFINITIONS: readonly { id: string; value: number }[] = [
  { id: 'compact', value: 0.2 },
  { id: 'cozy', value: 0.225 },
  { id: 'default', value: 0.25 },
  { id: 'roomy', value: 0.3 },
];

const DENSITY_TICKS = DENSITY_DEFINITIONS.map((p) => p.value);
const DENSITY_EQUALS = nearlyEquals(0.003);

export function SpacingField({ value, onChange }: Readonly<SpacingFieldProps>) {
  const { t } = useTranslation('themeBuilder');

  const presets = useMemo<Preset<number>[]>(
    () =>
      DENSITY_DEFINITIONS.map((p) => ({
        value: p.value,
        label: t(`fields.spacing.presets.${p.id}.label`),
        hint: t(`fields.spacing.presets.${p.id}.hint`),
      })),
    [t]
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Slider
          value={value}
          onChange={onChange}
          min={0.15}
          max={0.35}
          step={0.005}
          ticks={DENSITY_TICKS}
          className="flex-1"
        />
        <SliderValue
          value={value}
          onChange={onChange}
          min={0.15}
          max={0.35}
          step={0.005}
          unit="rem"
          width="w-12"
        />
      </div>

      <PresetChips
        presets={presets}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={DENSITY_EQUALS}
      />
    </div>
  );
}
