/**
 * Slider — a native range input rendered over a custom track with
 * optional tick dots for reference positions. Controlled numeric
 * primitive used wherever a value has a min/max range and a readable
 * unit (spacing, radius, width, etc.).
 */

import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Tailwind width class for the numeric input. Defaults to `w-10`. */
  numericWidth?: string;
  /** Round displayed numeric value to this many decimals. */
  decimals?: number;
  /** Values to render as dots on the track. Typically preset anchors. */
  ticks?: readonly number[];
  className?: string;
}

function pct(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return ((value - min) / (max - min)) * 100;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  numericWidth = 'w-10',
  decimals,
  ticks,
  className,
}: Readonly<SliderProps>) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) {
      onChange(next);
    }
  };

  const displayed = decimals === undefined ? value : Number(value.toFixed(decimals));
  const fillPct = pct(value, min, max);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex h-4 flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-muted" />
        <div
          className="pointer-events-none absolute left-0 h-1 rounded-full bg-primary"
          style={{ width: `${fillPct}%` }}
        />
        {ticks?.map((t) => (
          <span
            key={t}
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/35"
            style={{ left: `${pct(t, min, max)}%` }}
          />
        ))}
        <input
          type="range"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={cn(
            'relative h-4 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none',
            '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-raised [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110',
            '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-raised'
          )}
        />
      </div>
      <div className="flex items-center gap-0.5 rounded-control border border-input-border bg-input-container px-1.5 py-0.5 font-mono text-[10px] text-input-label has-[input:focus-visible]:border-ring">
        <input
          type="number"
          value={displayed}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={cn(
            numericWidth,
            'bg-transparent text-right outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          )}
        />
        {unit && <span className="text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
