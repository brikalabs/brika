/**
 * RadiusField — slider + preset chips + semantic preview.
 *
 * The live preview shows the four semantic radius tokens (pill,
 * control, container, surface) derived from the chosen base radius so
 * users see the whole scale ripple as they drag.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider, SliderValue } from '@/components/ui';
import { RADIUS_PRESETS } from '../radius-presets';
import { FieldPreview } from './FieldPreview';
import { cssVars, nearlyEquals, type Preset, PresetChips, SemanticTile } from './primitives';

interface RadiusFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const SEMANTIC_SAMPLES = [
  { key: 'pill', offset: -0.375 },
  { key: 'control', offset: -0.25 },
  { key: 'container', offset: 0 },
  { key: 'surface', offset: 0.25 },
] as const;

const RADIUS_EQUALS = nearlyEquals(0.001);
const RADIUS_TICKS = RADIUS_PRESETS.map((p) => p.value);

function remFor(base: number, offset: number): string {
  return `${Math.max(0, base + offset).toFixed(3)}rem`;
}

export function RadiusField({ value, onChange }: Readonly<RadiusFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  const scopedVars = cssVars({ '--radius': `${value}rem` });

  const localizedPresets = useMemo<Preset<number>[]>(
    () =>
      RADIUS_PRESETS.map((p) => ({
        label: t(`fields.radius.presets.${p.label.toLowerCase()}.label`, { defaultValue: p.label }),
        value: p.value,
        hint: t(`fields.radius.presets.${p.label.toLowerCase()}.hint`, { defaultValue: p.hint }),
      })),
    [t]
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Slider
          value={value}
          onChange={onChange}
          min={0}
          max={2}
          step={0.125}
          ticks={RADIUS_TICKS}
          className="flex-1"
        />
        <SliderValue
          value={value}
          onChange={onChange}
          min={0}
          max={2}
          step={0.125}
          unit="rem"
          width="w-8"
        />
      </div>

      <PresetChips
        presets={localizedPresets}
        value={value}
        onChange={onChange}
        columns="grid-cols-3"
        isActive={RADIUS_EQUALS}
      />

      <FieldPreview
        label={t('fields.radius.semanticLabel')}
        caption={t('fields.radius.caption', { value: value.toFixed(3) })}
        style={scopedVars}
      >
        <div className="grid w-full grid-cols-4 gap-2">
          {SEMANTIC_SAMPLES.map(({ key, offset }) => {
            const r = remFor(value, offset);
            return (
              <SemanticTile
                key={key}
                label={t(`fields.radius.samples.${key}.label`)}
                hint={t(`fields.radius.samples.${key}.hint`)}
                value={r}
              >
                <div
                  className="size-10 border-2 border-primary/40 bg-primary/10"
                  style={{ borderRadius: r }}
                  aria-hidden
                />
              </SemanticTile>
            );
          })}
        </div>
      </FieldPreview>
    </div>
  );
}
