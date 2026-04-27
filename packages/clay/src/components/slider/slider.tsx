/**
 * Slider — a native range input rendered over a custom track with
 * optional tick dots and labels. Pure track primitive: pair with
 * {@link SliderValue} (or any other readout) when a numeric display is
 * needed. Single source of truth for `value` / `onChange`.
 */

import type { ChangeEvent, ReactNode } from 'react';
import { cn } from '../../primitives/cn';

/**
 * Tick dot configuration:
 * - `true` — one dot at every `step` between min and max
 * - a number — one dot every N units (custom interval, independent of step)
 * - an array — explicit positions (preset anchors)
 */
type SliderTicks = boolean | number | readonly number[];

/**
 * Tick label configuration:
 * - `true` — render the raw tick value
 * - a function — render whatever node it returns
 */
type SliderTickLabels = boolean | ((value: number) => ReactNode);

interface SliderProps {
  /** Current numeric value (controlled). */
  value: number;
  /** Called with the next value as the user drags or types. */
  onChange: (next: number) => void;
  /** Lower numeric bound. */
  min: number;
  /** Upper numeric bound. */
  max: number;
  /** Increment for keyboard arrows and value snapping. */
  step: number;
  /** Render tick dots on the track. See {@link SliderTicks}. */
  ticks?: SliderTicks;
  /** Render labels below each tick. Pairs with `ticks`. See {@link SliderTickLabels}. */
  tickLabels?: SliderTickLabels;
  /** Extra Tailwind classes appended to the slider wrapper. */
  className?: string;
}

interface SliderValueProps {
  /** Current numeric value (controlled). */
  value: number;
  /** Called with the next value as the user drags or types. */
  onChange: (next: number) => void;
  /** Lower numeric bound. */
  min: number;
  /** Upper numeric bound. */
  max: number;
  /** Increment for keyboard arrows and value snapping. */
  step: number;
  /** Suffix appended to the displayed value (e.g. "%", "px"). */
  unit?: string;
  /** Tailwind width class for the numeric input. Defaults to `w-10`. */
  width?: string;
  /** Round displayed numeric value to this many decimals. */
  decimals?: number;
  /** Extra Tailwind classes appended to the value-input wrapper. */
  className?: string;
}

function fraction(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return (value - min) / (max - min);
}

/**
 * Native range inputs anchor the thumb's center at
 * `thumb_radius + fraction * (track_width - thumb_width)`, so a value
 * at max sits at `100% - thumb_radius`, not 100%. Use this for any
 * overlay (dot, label, fill end) that should line up with the thumb.
 */
function trackPos(value: number, min: number, max: number): string {
  const f = fraction(value, min, max);
  return `calc(var(--slider-thumb-size) / 2 + ${f} * (100% - var(--slider-thumb-size)))`;
}

function resolveTicks(
  ticks: SliderTicks | undefined,
  min: number,
  max: number,
  step: number
): readonly number[] | undefined {
  if (!ticks) {
    return undefined;
  }
  if (typeof ticks === 'object') {
    return ticks;
  }
  const interval = ticks === true ? step : ticks;
  if (interval <= 0 || max <= min) {
    return undefined;
  }
  // Cap at a reasonable density so e.g. step=0.001 doesn't render thousands of dots.
  const span = max - min;
  if (span / interval > 200) {
    return undefined;
  }
  const out: number[] = [];
  const epsilon = interval / 1000;
  for (let v = min + interval; v < max - epsilon; v += interval) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

function resolveLabelRender(
  tickLabels: SliderTickLabels | undefined
): ((value: number) => ReactNode) | null {
  if (typeof tickLabels === 'function') {
    return tickLabels;
  }
  if (tickLabels === true) {
    return (v: number) => v;
  }
  return null;
}

function numericChangeHandler(onChange: (next: number) => void) {
  return (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) {
      onChange(next);
    }
  };
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  ticks,
  tickLabels,
  className,
}: Readonly<SliderProps>) {
  const handleChange = numericChangeHandler(onChange);

  const tickValues = resolveTicks(ticks, min, max, step);
  const labelRender = resolveLabelRender(tickLabels);
  const showLabels = labelRender !== null && tickValues && tickValues.length > 0;

  return (
    <div
      data-slot="slider"
      className={cn('relative flex h-4 items-center', showLabels && 'mb-5', className)}
    >
      <div className="pointer-events-none absolute inset-x-0 h-[var(--slider-track-height)] rounded-slider bg-slider-track" />
      <div
        className="pointer-events-none absolute left-0 h-[var(--slider-track-height)] rounded-slider bg-slider-fill"
        style={{ width: trackPos(value, min, max) }}
      />
      {tickValues?.map((t) => {
        const active = t <= value;
        return (
          <span
            key={t}
            aria-hidden
            data-active={active || undefined}
            className={cn(
              'pointer-events-none absolute top-1/2 size-[var(--slider-tick-size)] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors',
              active ? 'bg-slider-tick-active/70' : 'bg-slider-tick/30'
            )}
            style={{ left: trackPos(t, min, max) }}
          />
        );
      })}
      {showLabels &&
        tickValues.map((t) => (
          <span
            key={`label-${t}`}
            aria-hidden
            data-active={t === value || undefined}
            className="pointer-events-none absolute top-full mt-2 -translate-x-1/2 font-mono text-[10px] text-slider-label tabular-nums data-[active=true]:text-slider-label-active"
            style={{ left: trackPos(t, min, max) }}
          >
            {labelRender(t)}
          </span>
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
          '[&::-webkit-slider-thumb]:size-[var(--slider-thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-slider-thumb [&::-webkit-slider-thumb]:border-[length:var(--slider-thumb-border-width)] [&::-webkit-slider-thumb]:border-slider-thumb-border [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:bg-slider-thumb [&::-webkit-slider-thumb]:shadow-slider-thumb [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110',
          '[&::-moz-range-thumb]:size-[var(--slider-thumb-size)] [&::-moz-range-thumb]:rounded-slider-thumb [&::-moz-range-thumb]:border-[length:var(--slider-thumb-border-width)] [&::-moz-range-thumb]:border-slider-thumb-border [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:bg-slider-thumb [&::-moz-range-thumb]:shadow-slider-thumb'
        )}
      />
    </div>
  );
}

/**
 * SliderValue — the boxed numeric readout / input that pairs with
 * {@link Slider}. Bind both to the same `value` / `onChange`.
 */
export function SliderValue({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  width = 'w-10',
  decimals,
  className,
}: Readonly<SliderValueProps>) {
  const handleChange = numericChangeHandler(onChange);

  const displayed = decimals === undefined ? value : Number(value.toFixed(decimals));

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-control border border-input-border bg-input-container px-1.5 py-0.5 font-mono text-[10px] text-input-label has-[input:focus-visible]:border-ring',
        className
      )}
    >
      <input
        type="number"
        value={displayed}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        className={cn(
          width,
          'bg-transparent text-right outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
        )}
      />
      {unit && <span className="text-muted-foreground">{unit}</span>}
    </div>
  );
}
