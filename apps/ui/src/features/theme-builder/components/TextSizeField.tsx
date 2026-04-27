/**
 * TextSizeField — slider + presets controlling `--text-base`, the
 * scalar every typography level derives from (display / headline /
 * title / body / label). A small triple-line preview shows how the
 * scale feels at the chosen base size.
 */

import { Slider, SliderValue } from '@brika/clay';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cssVars, nearlyEquals, type Preset, PresetChips } from './primitives';

interface TextSizeFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const TEXT_DEFINITIONS: readonly { id: string; value: number }[] = [
  { id: 'compact', value: 0.9 },
  { id: 'default', value: 1 },
  { id: 'comfortable', value: 1.075 },
  { id: 'large', value: 1.15 },
];

const TEXT_TICKS = TEXT_DEFINITIONS.map((p) => p.value);
const TEXT_EQUALS = nearlyEquals(0.005);

export function TextSizeField({ value, onChange }: Readonly<TextSizeFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  const scopedVars = cssVars({ '--text-base': `${value}rem` });

  const presets = useMemo<Preset<number>[]>(
    () =>
      TEXT_DEFINITIONS.map((p) => ({
        value: p.value,
        label: t(`fields.textSize.presets.${p.id}.label`),
        hint: t(`fields.textSize.presets.${p.id}.hint`),
      })),
    [t]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Slider
          value={value}
          onChange={onChange}
          min={0.8}
          max={1.25}
          step={0.025}
          ticks={TEXT_TICKS}
          className="flex-1"
        />
        <SliderValue
          value={value}
          onChange={onChange}
          min={0.8}
          max={1.25}
          step={0.025}
          unit="rem"
          width="w-10"
          decimals={3}
        />
      </div>
      <PresetChips
        presets={presets}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={TEXT_EQUALS}
      />
      <div className="space-y-1 rounded-container border bg-muted/20 p-safe-md" style={scopedVars}>
        <div className="font-semibold text-title-lg leading-tight">
          {t('fields.textSize.preview.title')}
        </div>
        <div className="text-body-md text-foreground/80">{t('fields.textSize.preview.body')}</div>
        <div className="font-medium text-label-sm text-muted-foreground uppercase tracking-wider">
          {t('fields.textSize.preview.label')}
        </div>
      </div>
    </div>
  );
}
