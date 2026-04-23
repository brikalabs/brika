/**
 * EffectsField — elevation profile picker and border-width control.
 *
 * Elevation renders a profile picker (flat / soft / crisp / dramatic)
 * plus a 5-tile preview of the derived semantic levels (surface →
 * spotlight). Border-width renders four chips with live samples.
 */

import { Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { elevationsFor, shadowScaleFor } from '../effects-css';
import { ELEVATION_STYLES, type ElevationStyle } from '../types';
import { FieldPreview } from './FieldPreview';
import { nearlyEquals, type Preset, PresetChips, SemanticTile } from './primitives';

interface ElevationPickerProps {
  value: ElevationStyle;
  onChange: (next: ElevationStyle) => void;
  tint: boolean;
  onTintChange: (next: boolean) => void;
}

const ELEVATION_LABELS: Record<ElevationStyle, string> = {
  flat: 'Flat',
  soft: 'Soft',
  crisp: 'Crisp',
  dramatic: 'Dramatic',
};

const SEMANTIC_LEVELS = [
  { key: 'surface', label: 'Surface', hint: 'inline cards' },
  { key: 'raised', label: 'Raised', hint: 'cards, buttons' },
  { key: 'overlay', label: 'Overlay', hint: 'popovers, menus' },
  { key: 'modal', label: 'Modal', hint: 'dialogs, sheets' },
  { key: 'spotlight', label: 'Spotlight', hint: 'toasts' },
] as const;

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
  const elevation = elevationsFor(value);

  return (
    <div className="space-y-2">
      {/* Profile picker — 4 chips with shadow samples */}
      <div className="grid grid-cols-4 gap-1.5">
        {ELEVATION_STYLES.map((style) => {
          const scale = shadowScaleFor(style);
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
                style={{ boxShadow: inertShadow(scale.md) }}
              />
              <span className="font-medium">{ELEVATION_LABELS[style]}</span>
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-between rounded-control border bg-muted/20 px-2.5 py-1.5 text-xs">
        <span>Tint with primary</span>
        <Switch checked={tint} onCheckedChange={onTintChange} />
      </label>

      <FieldPreview label="Semantic levels" caption="by UI purpose">
        <div className="grid w-full grid-cols-5 gap-2">
          {SEMANTIC_LEVELS.map(({ key, label, hint }) => (
            <SemanticTile key={key} label={label} hint={hint}>
              <div
                className="size-10 rounded-control border bg-background"
                style={{ boxShadow: inertShadow(elevation[key]) }}
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

const BORDER_PRESETS: readonly Preset<number>[] = [
  { label: 'Hairline', value: 0.5, hint: '0.5px' },
  { label: 'Regular', value: 1, hint: '1px' },
  { label: 'Medium', value: 1.5, hint: '1.5px' },
  { label: 'Bold', value: 2, hint: '2px' },
];

const BORDER_EQUALS = nearlyEquals(0.01);

export function BorderWidthField({ value, onChange }: Readonly<BorderWidthFieldProps>) {
  return (
    <div className="space-y-2">
      <PresetChips
        presets={BORDER_PRESETS}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={BORDER_EQUALS}
      />
      <FieldPreview label="Preview" caption={`${value}px`}>
        <div className="grid w-full grid-cols-4 gap-2">
          {BORDER_PRESETS.map((p) => (
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
