/**
 * TokenField — dispatches to the right widget based on a clay token's
 * granular `type`. Encapsulates the parse/format + storage selection
 * logic so `ComponentsSection` can render any clay token by mapping
 * over `tokensByCategoryFor(component)`.
 *
 * Storage:
 *   - `type === 'color'` → `theme.colors[mode][token.name]` (light/dark split).
 *   - everything else    → `theme.componentTokens[component][suffix]` (mode-invariant).
 */

import { Slider, SliderValue } from '@brika/clay';
import type { ResolvedTokenSpec, TokenType } from '@brika/clay/tokens';
import { type ReactNode, useCallback } from 'react';
import { tokenSuffix } from '../clay-tokens';
import type { ColorToken, CornerStyle, ThemeConfig } from '../types';
import { ColorField } from './ColorField';
import { CornerField } from './CornerField';

interface NumericConfig {
  unit: '' | 'rem' | 'px' | 'em' | 'ms';
  min: number;
  max: number;
  step: number;
  decimals: number;
}

const NUMERIC_BY_TYPE: Partial<Record<TokenType, NumericConfig>> = {
  radius: { unit: 'rem', min: 0, max: 2, step: 0.0625, decimals: 4 },
  size: { unit: 'rem', min: 0, max: 4, step: 0.0625, decimals: 4 },
  'border-width': { unit: 'px', min: 0, max: 8, step: 1, decimals: 0 },
  'font-size': { unit: 'rem', min: 0.5, max: 3, step: 0.0625, decimals: 4 },
  'line-height': { unit: '', min: 0.8, max: 2.5, step: 0.05, decimals: 2 },
  'letter-spacing': { unit: 'em', min: -0.1, max: 0.3, step: 0.005, decimals: 3 },
  blur: { unit: 'px', min: 0, max: 64, step: 1, decimals: 0 },
  duration: { unit: 'ms', min: 0, max: 1000, step: 10, decimals: 0 },
  opacity: { unit: '', min: 0, max: 1, step: 0.01, decimals: 2 },
};

interface TokenFieldProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  mode: 'light' | 'dark';
  onColorChange: (
    token: ColorToken,
    slot: 'light' | 'dark' | 'both',
    value: string | undefined
  ) => void;
  onTokenChange: (component: string, suffix: string, value: string | undefined) => void;
}

export function TokenField({
  spec,
  draft,
  mode,
  onColorChange,
  onTokenChange,
}: Readonly<TokenFieldProps>) {
  if (spec.type === 'color') {
    return <ColorTokenWidget spec={spec} draft={draft} mode={mode} onColorChange={onColorChange} />;
  }
  return <NonColorTokenWidget spec={spec} draft={draft} onTokenChange={onTokenChange} />;
}

/* ─── Color ─────────────────────────────────────────────────── */

interface ColorTokenWidgetProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  mode: 'light' | 'dark';
  onColorChange: (
    token: ColorToken,
    slot: 'light' | 'dark' | 'both',
    value: string | undefined
  ) => void;
}

function ColorTokenWidget({ spec, draft, mode, onColorChange }: Readonly<ColorTokenWidgetProps>) {
  const palette = mode === 'light' ? draft.colors.light : draft.colors.dark;
  const override = palette[spec.name];
  const fallback = mode === 'dark' && spec.defaultDark ? spec.defaultDark : spec.defaultLight;
  const effective = override ?? fallback;

  return (
    <ColorField
      label={spec.name}
      value={effective}
      onChange={(value) => onColorChange(spec.name, 'both', value)}
    />
  );
}

/* ─── Non-color (numeric, corner-shape, free-text) ───────────── */

interface NonColorTokenWidgetProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  onTokenChange: (component: string, suffix: string, value: string | undefined) => void;
}

function NonColorTokenWidget({ spec, draft, onTokenChange }: Readonly<NonColorTokenWidgetProps>) {
  const component = spec.appliesTo ?? '';
  const suffix = tokenSuffix(spec);
  const setValue = useCallback(
    (value: string | undefined) => {
      if (component) {
        onTokenChange(component, suffix, value);
      }
    },
    [component, suffix, onTokenChange]
  );

  if (!component) {
    return null;
  }
  const stored = draft.componentTokens?.[component]?.[suffix];
  let overrideStr: string | undefined;
  if (typeof stored === 'string') {
    overrideStr = stored;
  } else if (stored !== undefined) {
    overrideStr = String(stored);
  }
  const effective = overrideStr ?? spec.defaultLight;

  if (spec.type === 'corner-shape') {
    return <CornerShapeWidget value={effective} onChange={setValue} />;
  }
  if (spec.type === 'border-style') {
    return (
      <SelectWidget
        value={effective}
        options={['solid', 'dashed', 'double', 'none']}
        onChange={setValue}
      />
    );
  }
  if (spec.type === 'text-transform') {
    return (
      <SelectWidget
        value={effective}
        options={['none', 'uppercase', 'lowercase', 'capitalize']}
        onChange={setValue}
      />
    );
  }
  if (spec.type === 'font-weight') {
    return (
      <SelectWidget
        value={effective}
        options={['300', '400', '500', '600', '700', '800', '900']}
        onChange={setValue}
      />
    );
  }
  const numeric = NUMERIC_BY_TYPE[spec.type];
  if (numeric) {
    return <NumericWidget cfg={numeric} value={effective} onChange={setValue} />;
  }
  // shadow, easing, font-family — free-form CSS string
  return <TextWidget value={effective} placeholder={spec.defaultLight} onChange={setValue} />;
}

/* ─── Widgets ───────────────────────────────────────────────── */

interface NumericWidgetProps {
  cfg: NumericConfig;
  value: string;
  onChange: (value: string | undefined) => void;
}

function NumericWidget({ cfg, value, onChange }: Readonly<NumericWidgetProps>) {
  const parsed = parseNumeric(value, cfg.unit);
  const handleChange = useCallback(
    (next: number) => {
      const clamped = Math.max(cfg.min, Math.min(cfg.max, next));
      onChange(formatNumeric(clamped, cfg.unit, cfg.decimals));
    },
    [cfg, onChange]
  );
  return (
    <div className="flex items-center gap-2">
      <Slider
        value={parsed}
        onChange={handleChange}
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        className="flex-1"
      />
      <SliderValue
        value={parsed}
        onChange={handleChange}
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        unit={cfg.unit || undefined}
        width="w-16"
        decimals={cfg.decimals}
      />
    </div>
  );
}

function parseNumeric(value: string, unit: string): number {
  const trimmed = value.trim();
  if (!unit) {
    return Number.parseFloat(trimmed) || 0;
  }
  const stripped = trimmed.endsWith(unit) ? trimmed.slice(0, -unit.length) : trimmed;
  return Number.parseFloat(stripped) || 0;
}

function formatNumeric(value: number, unit: string, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return unit ? `${rounded}${unit}` : String(rounded);
}

interface CornerShapeWidgetProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

function CornerShapeWidget({ value, onChange }: Readonly<CornerShapeWidgetProps>) {
  // Strip any `var(--corner-shape, …)` wrapper to read the keyword.
  const keyword = parseCornerKeyword(value);
  return <CornerField value={keyword} onChange={(v) => onChange(v)} radius={0.75} />;
}

function parseCornerKeyword(value: string): CornerStyle {
  const allowed: readonly CornerStyle[] = ['round', 'squircle', 'bevel', 'scoop', 'notch'];
  for (const k of allowed) {
    if (value === k || value.includes(`, ${k}`) || value.endsWith(`,${k})`)) {
      return k;
    }
  }
  return 'round';
}

interface SelectWidgetProps {
  value: string;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
}

function SelectWidget({ value, options, onChange }: Readonly<SelectWidgetProps>): ReactNode {
  return (
    <select
      value={options.includes(value) ? value : options[0]}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="w-full rounded-control border bg-background px-2 py-1 text-xs"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

interface TextWidgetProps {
  value: string;
  placeholder: string;
  onChange: (value: string | undefined) => void;
}

function TextWidget({ value, placeholder, onChange }: Readonly<TextWidgetProps>) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.currentTarget.value;
        onChange(v === '' ? undefined : v);
      }}
      className="w-full rounded-control border bg-background px-2 py-1 font-mono text-[11px]"
    />
  );
}
