/**
 * SliderInput — slider + numeric input + unit suffix.
 * Used by every numeric theme field so the control feels identical.
 */

import type { ChangeEvent } from 'react';

interface SliderInputProps {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Width (tailwind class) of the numeric input. Defaults to `w-10`. */
  numericWidth?: string;
  /** Round displayed numeric value to this many decimals in the input. */
  decimals?: number;
}

export function SliderInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  numericWidth = 'w-10',
  decimals,
}: Readonly<SliderInputProps>) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) {
      onChange(next);
    }
  };

  const displayed = decimals === undefined ? value : Number(value.toFixed(decimals));

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <div className="flex items-center gap-0.5 rounded-control border bg-background px-1.5 py-0.5 font-mono text-[10px]">
        <input
          type="number"
          value={displayed}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={`${numericWidth} bg-transparent text-right outline-none`}
        />
        <span className="text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
