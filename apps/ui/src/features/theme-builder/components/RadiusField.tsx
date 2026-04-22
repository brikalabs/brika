/**
 * RadiusField — slider + numeric input for the --radius scalar (rem).
 * Live previews the resulting rounded-* scale with 3 pill samples.
 */

import type { ChangeEvent } from 'react';

interface RadiusFieldProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function RadiusField({
  value,
  onChange,
  min = 0,
  max = 2,
  step = 0.125,
}: Readonly<RadiusFieldProps>) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) {
      onChange(next);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="range"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-mono text-xs">
          <input
            type="number"
            value={value}
            onChange={handleChange}
            min={min}
            max={max}
            step={step}
            className="w-12 bg-transparent text-right outline-none"
          />
          <span className="text-muted-foreground">rem</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {[
          { size: 'size-10', label: 'sm', calc: `calc(${value}rem - 0.375rem)` },
          { size: 'size-10', label: 'lg', calc: `${value}rem` },
          { size: 'size-10', label: 'xl', calc: `calc(${value}rem + 0.25rem)` },
        ].map((sample) => (
          <div
            key={sample.label}
            className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"
          >
            <div
              className={`${sample.size} border bg-muted`}
              style={{ borderRadius: sample.calc }}
            />
            <span>{sample.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
