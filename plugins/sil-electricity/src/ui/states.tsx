/**
 * Shared brick UI primitives: status placeholders and value formatters.
 */

import { useBrickSize } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Hourglass, LockKeyhole, type LucideIcon, WifiOff } from 'lucide-react';
import type { ConsumptionPoint, Prices } from '../types';

export type SizeTier = 'compact' | 'normal' | 'wide' | 'full';

/**
 * Map the brick's grid span to a layout tier so cards adapt to their size:
 *  - compact: a 1-cell card shows only the headline value (never clipped).
 *  - normal: a 2x2 card stacks the value plus a line of sub-detail.
 *  - wide: a short-but-wide card (3+ cells across, 2 tall, e.g. 3x2 / 4x2)
 *    splits horizontally so the chart/sparkline fills the spare width instead
 *    of leaving it empty.
 *  - full: a 3+ cell tall card stacks the value over a full-height chart.
 * Driven by grid cells (width and height), not width-only container queries, so
 * a SHORT card downgrades too instead of overflowing its value.
 */
export function useSizeTier(): SizeTier {
  const { width, height } = useBrickSize();
  if (height <= 1 || width <= 1) {
    return 'compact';
  }
  if (height >= 3) {
    return 'full';
  }
  if (width >= 3) {
    return 'wide';
  }
  return 'normal';
}

/** kWh consumed in a 15-minute slot → average power in watts. */
export function kwhToWatts(kwh: number): number {
  return Math.round(kwh * 4 * 1000); // 4 slots/hour × 1000 W/kW
}

export function formatKwh(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} MWh`;
  }
  if (value >= 10) {
    return `${value.toFixed(1)} kWh`;
  }
  return `${value.toFixed(2)} kWh`;
}

export function formatPower(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`;
  }
  return `${watts} W`;
}

export function formatChf(value: number): string {
  return `${value.toFixed(2)} CHF`;
}

/** Net CHF cost of a single point, accounting for solar credit. */
export function pointCost(point: ConsumptionPoint, prices: Prices): number {
  return point.total * prices.perKwh - point.injection * prices.perInjection;
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

export function Message({ icon: Icon, text }: Readonly<{ icon: LucideIcon; text: string }>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="text-muted-foreground text-xs">{text}</p>
    </div>
  );
}

/**
 * Placeholder for a period that has no usable data yet: a lock or no-signal
 * fault message when an auth or network error is blocking the fetch, otherwise
 * the tone-matched spinner. Every period-driven brick funnels its "no data"
 * branch through here so a stuck session surfaces the real cause instead of
 * spinning forever.
 */
export function PeriodPlaceholder({
  error,
  tone,
}: Readonly<{ error?: string | null; tone?: Tone }>) {
  const { t } = useLocale();
  if (error === 'rateLimited') {
    return <Message icon={Hourglass} text={t('ui.rateLimited')} />;
  }
  if (error === 'auth') {
    return <Message icon={LockKeyhole} text={t('ui.authError')} />;
  }
  if (error === 'network') {
    return <Message icon={WifiOff} text={t('ui.networkError')} />;
  }
  return <Loader tone={tone} />;
}
