/**
 * Shared brick UI primitives: status placeholders and value formatters.
 */

import type { ConsumptionPoint, Prices } from '../types';

/** kWh consumed in a 15-minute slot → average power in watts. */
export function kwhToWatts(kwh: number): number {
  return Math.round(kwh * 4 * 1000); // 4 slots/hour × 1000 W/kW
}

export function formatKwh(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} MWh`;
  if (value >= 10) return `${value.toFixed(1)} kWh`;
  return `${value.toFixed(2)} kWh`;
}

export function formatPower(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
  return `${watts} W`;
}

export function formatChf(value: number): string {
  return `${value.toFixed(2)} CHF`;
}

/** Net CHF cost of a single point, accounting for solar credit. */
export function pointCost(point: ConsumptionPoint, prices: Prices): number {
  return point.total * prices.perKwh - point.injection * prices.perInjection;
}

/** Net CHF cost across multiple points. */
export function totalCost(points: readonly ConsumptionPoint[], prices: Prices): number {
  let sum = 0;
  for (const p of points) sum += pointCost(p, prices);
  return sum;
}

type Tone = 'blue' | 'yellow' | 'emerald' | 'violet';

// Map each brick's accent tone to a clay data-viz slot so the spinner
// retints with the theme. data-1=blue, data-3=green, data-5=purple, data-6=yellow.
const TONE_BORDER: Record<Tone, string> = {
  blue: 'border-data-1',
  yellow: 'border-data-6',
  emerald: 'border-data-3',
  violet: 'border-data-5',
};

export function Loader({ tone = 'blue' }: Readonly<{ tone?: Tone }>) {
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className={`size-5 animate-spin rounded-full border-2 border-t-transparent ${TONE_BORDER[tone]}`}
      />
    </div>
  );
}

export function Message({ icon, text }: Readonly<{ icon: string; text: string }>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
