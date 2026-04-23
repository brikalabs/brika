/**
 * SpacingField — slider + density presets + live card + size ruler.
 *
 * The field exposes:
 *   • Slider + numeric bound to `--spacing` (rem).
 *   • Four density presets (Compact / Cozy / Default / Roomy).
 *   • A live Card + Button preview that resizes with --spacing.
 *   • A size ruler mapping xs/sm/md/lg/xl to pixels at the current value.
 */

import { MousePointerClick, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { FieldPreview } from './FieldPreview';
import { cssVars, nearlyEquals, type Preset, PresetChips, SliderInput } from './primitives';

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

const SIZE_STOPS = [
  { label: 'xs', step: 1 },
  { label: 'sm', step: 2 },
  { label: 'md', step: 4 },
  { label: 'lg', step: 6 },
  { label: 'xl', step: 8 },
] as const;

const HERO_LABEL = 'md';
const DENSITY_EQUALS = nearlyEquals(0.003);

function px(step: number, value: number): number {
  return Math.round(step * value * 16);
}

export function SpacingField({ value, onChange }: Readonly<SpacingFieldProps>) {
  const scopedVars = cssVars({ '--spacing': `${value}rem` });

  return (
    <div className="space-y-2.5">
      <SliderInput
        value={value}
        onChange={onChange}
        min={0.15}
        max={0.35}
        step={0.005}
        unit="rem"
        numericWidth="w-12"
      />

      <PresetChips
        presets={DENSITY_PRESETS}
        value={value}
        onChange={onChange}
        columns="grid-cols-4"
        isActive={DENSITY_EQUALS}
      />

      <FieldPreview label="Live preview" caption={`${value.toFixed(3)}rem`} style={scopedVars}>
        <Card className="w-full max-w-65 shadow-raised">
          <CardHeader className="gap-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs">Workspace</CardTitle>
              <Badge variant="secondary" className="text-[9px]">
                Pro
              </Badge>
            </div>
            <CardDescription className="text-[10px]">
              Padding + gap scale with spacing
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 p-3 pt-0">
            <Button size="xs" className="gap-1">
              <MousePointerClick className="size-3" />
              Open
            </Button>
            <Button size="xs" variant="outline" className="gap-1">
              <Plus className="size-3" />
              New
            </Button>
          </CardContent>
        </Card>
      </FieldPreview>

      <FieldPreview label="Sizes" caption={`at ${value.toFixed(3)}rem`}>
        <div className="flex w-full items-end gap-2">
          {SIZE_STOPS.map(({ label, step }) => {
            const isHero = label === HERO_LABEL;
            return (
              <div
                key={label}
                className="flex min-w-0 flex-1 flex-col items-stretch gap-1 leading-tight"
              >
                <div
                  className={cn(
                    'rounded-sm transition-[height] duration-150',
                    isHero ? 'bg-primary' : 'bg-primary/35'
                  )}
                  style={{ height: `${Math.min(px(step, value), 40)}px` }}
                  aria-hidden
                />
                <div
                  className={cn(
                    'text-center font-medium text-[10px]',
                    isHero ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </div>
                <div className="text-center font-mono text-[9px] text-muted-foreground/80 tabular-nums">
                  {px(step, value)}px
                </div>
              </div>
            );
          })}
        </div>
      </FieldPreview>
    </div>
  );
}
