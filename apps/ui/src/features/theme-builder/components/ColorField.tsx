/**
 * ColorField — a token name + swatch + hex input row.
 * The swatch opens the browser's native color picker; the text input
 * accepts any CSS color (hex, oklch, rgb...). Both paths call onChange.
 */

import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

export function ColorField({ label, value, onChange, className }: Readonly<ColorFieldProps>) {
  const handlePicker = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);
  const handleText = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label
        className="flex-1 cursor-pointer truncate font-mono text-muted-foreground text-xs"
        htmlFor={`color-${label}`}
      >
        {label}
      </label>
      <div className="relative size-7 shrink-0 overflow-hidden rounded-md border shadow-sm">
        <div className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          id={`color-${label}`}
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={handlePicker}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={handleText}
        spellCheck={false}
        className="w-24 rounded-md border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
