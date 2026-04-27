/**
 * EffectsField — elevation profile picker and border-width control.
 *
 * Elevation renders a profile picker (flat / soft / crisp / dramatic)
 * plus a 5-tile preview of the derived semantic levels (surface →
 * spotlight). Border-width renders four chips with live samples.
 */

import { cn, Switch } from '@brika/clay';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { shadowScaleFor } from '../theme-css';
import { ELEVATION_STYLES, type ElevationStyle } from '../types';
import { FieldPreview } from './FieldPreview';
import { nearlyEquals, type Preset, PresetChips, SemanticTile } from './primitives';

type NumericShadowKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ElevationPickerProps {
  value: ElevationStyle;
  onChange: (next: ElevationStyle) => void;
  tint: boolean;
  onTintChange: (next: boolean) => void;
}

const SEMANTIC_LEVELS: readonly { key: string; scale: NumericShadowKey }[] = [
  { key: 'surface', scale: 'xs' },
  { key: 'raised', scale: 'sm' },
  { key: 'overlay', scale: 'md' },
  { key: 'modal', scale: 'lg' },
  { key: 'spotlight', scale: 'xl' },
];

/** Strip the --shadow-rgb fallback so the field-local preview works
 *  without being inside a themed scope. */
function inertShadow(value: string): string {
  return value.replaceAll('var(--shadow-rgb, 0 0 0)', '0 0 0');
}

export function ElevationField({
  value,
  onChange,
  tint,
  onTintChange,
}: Readonly<ElevationPickerProps>) {
  const { t } = useTranslation('themeBuilder');
  const activeScale = shadowScaleFor(value);

  return (
    <div className="space-y-2">
      {/* Profile picker — 4 chips with shadow samples */}
      <div className="grid grid-cols-4 gap-1.5">
        {ELEVATION_STYLES.map((style) => {
          const chipScale = shadowScaleFor(style);
          const active = style === value;
          return (
            <button
              key={style}
              type="button"
              onClick={() => onChange(style)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-2 rounded-control border bg-card px-2 py-3 text-[10px] transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <div
                className="size-8 rounded-control border bg-background"
                style={{ boxShadow: inertShadow(chipScale.md) }}
              />
              <span className="font-medium">{t(`fields.effects.elevation.${style}`)}</span>
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-between rounded-control border bg-muted/20 px-2.5 py-1.5 text-xs">
        <span>{t('fields.effects.elevation.tintWithPrimary')}</span>
        <Switch checked={tint} onCheckedChange={onTintChange} />
      </label>

      <FieldPreview
        label={t('fields.effects.elevation.semanticLevels')}
        caption={t('fields.effects.elevation.byPurpose')}
      >
        <div className="grid w-full grid-cols-5 gap-2">
          {SEMANTIC_LEVELS.map(({ key, scale }) => (
            <SemanticTile
              key={key}
              label={t(`fields.effects.elevation.levels.${key}.label`)}
              hint={t(`fields.effects.elevation.levels.${key}.hint`)}
            >
              <div
                className="size-10 rounded-control border bg-background"
                style={{ boxShadow: inertShadow(activeScale[scale]) }}
                aria-hidden
              />
            </SemanticTile>
          ))}
        </div>
      </FieldPreview>
    </div>
  );
}

/* ─── Border width ──────────────────────────────────────────── */

interface BorderWidthFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const BORDER_DEFS: readonly { id: string; value: number; hint: string }[] = [
  { id: 'hairline', value: 0.5, hint: '0.5px' },
  { id: 'regular', value: 1, hint: '1px' },
  { id: 'medium', value: 1.5, hint: '1.5px' },
  { id: 'bold', value: 2, hint: '2px' },
];

const BORDER_EQUALS = nearlyEquals(0.01);

export function BorderWidthField({ value, onChange }: Readonly<BorderWidthFieldProps>) {
  const { t } = useTranslation('themeBuilder');

  const presets = useMemo<Preset<number>[]>(
    () =>
      BORDER_DEFS.map((p) => ({
        value: p.value,
        label: t(`fields.effects.border.presets.${p.id}.label`),
        hint: t(`fields.effects.border.presets.${p.id}.hint`, { defaultValue: p.hint }),
      })),
    [t]
  );

  return (
    <div className="space-y-2">
      <PresetChips
        presets={presets}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={BORDER_EQUALS}
      />
      <FieldPreview label={t('fields.effects.border.preview')} caption={`${value}px`}>
        <div className="grid w-full grid-cols-4 gap-2">
          {presets.map((p) => (
            <SemanticTile key={p.label} label={p.label} value={<span>{p.value}px</span>}>
              <div
                className="h-6 w-full rounded-control bg-background"
                style={{ border: `${p.value}px solid var(--border)` }}
                aria-hidden
              />
            </SemanticTile>
          ))}
        </div>
      </FieldPreview>
    </div>
  );
}
