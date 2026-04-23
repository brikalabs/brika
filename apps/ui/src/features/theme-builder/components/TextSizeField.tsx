/**
 * TextSizeField — slider + presets controlling `--text-base`, the
 * scalar every typography level derives from (display / headline /
 * title / body / label). A small triple-line preview shows how the
 * scale feels at the chosen base size.
 */

import { Slider } from '@/components/ui';
import { cssVars, nearlyEquals, type Preset, PresetChips } from './primitives';

interface TextSizeFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const TEXT_PRESETS: readonly Preset<number>[] = [
  { label: 'Compact', value: 0.9, hint: 'Denser, reads like a tool' },
  { label: 'Default', value: 1, hint: 'Standard base size' },
  { label: 'Comfortable', value: 1.075, hint: 'Easier to read at a distance' },
  { label: 'Large', value: 1.15, hint: 'Extra-readable' },
];

const TEXT_TICKS = TEXT_PRESETS.map((p) => p.value);
const TEXT_EQUALS = nearlyEquals(0.005);

export function TextSizeField({ value, onChange }: Readonly<TextSizeFieldProps>) {
  const scopedVars = cssVars({ '--text-base': `${value}rem` });

  return (
    <div className="space-y-2">
      <Slider
        value={value}
        onChange={onChange}
        min={0.8}
        max={1.25}
        step={0.025}
        unit="rem"
        numericWidth="w-10"
        decimals={3}
        ticks={TEXT_TICKS}
      />
      <PresetChips
        presets={TEXT_PRESETS}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={TEXT_EQUALS}
      />
      <div
        className="space-y-1 rounded-container border bg-muted/20 p-safe-md"
        style={scopedVars}
      >
        <div className="font-semibold text-title-lg leading-tight">Title</div>
        <div className="text-body-md text-foreground/80">
          Body text renders at the chosen base size. Every level scales from one scalar.
        </div>
        <div className="font-medium text-label-sm text-muted-foreground uppercase tracking-wider">
          Label
        </div>
      </div>
    </div>
  );
}
