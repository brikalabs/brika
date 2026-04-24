/**
 * PresetChips — a grid of quick-pick chips used by every preset-driven
 * field (radius, density, blur, border-width).
 *
 * The active chip is determined by the supplied `isActive` predicate so
 * callers can use whatever equality they need (exact match, epsilon, etc.).
 */

import { cn } from '@/lib/utils';

export interface Preset<T> {
  label: string;
  value: T;
  hint?: string;
}

interface PresetChipsProps<T> {
  presets: readonly Preset<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Tailwind grid-cols class; default is 4 columns. */
  columns?: string;
  /** Equality override — defaults to `Object.is`. */
  isActive?: (presetValue: T, current: T) => boolean;
}

export function PresetChips<T>({
  presets,
  value,
  onChange,
  columns = 'grid-cols-4',
  isActive = Object.is,
}: Readonly<PresetChipsProps<T>>) {
  return (
    <div className={cn('grid gap-1', columns)}>
      {presets.map((p) => {
        const active = isActive(p.value, value);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            title={p.hint}
            aria-pressed={active}
            className={cn(
              'rounded-control border px-2 py-1 font-medium text-[10px] transition-colors',
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/** Default epsilon-based equality for numeric presets. */
export function nearlyEquals(epsilon = 0.003): (a: number, b: number) => boolean {
  return (a, b) => Math.abs(a - b) < epsilon;
}
