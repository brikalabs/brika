import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, SliderValue } from '@brika/clay';
import type { ReactNode } from 'react';
import { useCallback } from 'react';
import type { CornerStyle } from '../types';
import { CornerField } from './CornerField';

export interface NumericConfig {
  unit: '' | 'rem' | 'px' | 'em' | 'ms';
  min: number;
  max: number;
  step: number;
  decimals: number;
}

interface NumericWidgetProps {
  cfg: NumericConfig;
  value: string;
  onChange: (value: string | undefined) => void;
}

export function NumericWidget({ cfg, value, onChange }: Readonly<NumericWidgetProps>) {
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
      <Slider value={parsed} onChange={handleChange} min={cfg.min} max={cfg.max} step={cfg.step} className="flex-1" />
      <SliderValue value={parsed} onChange={handleChange} min={cfg.min} max={cfg.max} step={cfg.step} unit={cfg.unit || undefined} width="w-16" decimals={cfg.decimals} />
    </div>
  );
}

function parseNumeric(value: string, unit: string): number {
  const trimmed = value.trim();
  if (!unit) return Number.parseFloat(trimmed) || 0;
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

export function CornerShapeWidget({ value, onChange }: Readonly<CornerShapeWidgetProps>) {
  const keyword = parseCornerKeyword(value);
  return <CornerField value={keyword} onChange={(v) => onChange(v)} radius={0.75} />;
}

function parseCornerKeyword(value: string): CornerStyle {
  const allowed: readonly CornerStyle[] = ['round', 'squircle', 'bevel', 'scoop', 'notch'];
  for (const k of allowed) {
    if (value === k || value.includes(`, ${k}`) || value.endsWith(`,${k})`)) return k;
  }
  return 'round';
}

interface SelectWidgetProps {
  value: string;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
}

export function SelectWidget({ value, options, onChange }: Readonly<SelectWidgetProps>): ReactNode {
  return (
    <Select value={options.includes(value) ? value : options[0]} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TextWidgetProps {
  value: string;
  placeholder: string;
  onChange: (value: string | undefined) => void;
}

export function TextWidget({ value, placeholder, onChange }: Readonly<TextWidgetProps>) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => { const v = e.currentTarget.value; onChange(v === '' ? undefined : v); }}
      className="h-7 font-mono text-[11px]"
    />
  );
}
