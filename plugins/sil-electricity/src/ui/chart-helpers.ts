import type { PluginLocale } from '@brika/sdk/ui-kit/hooks';
import type { ConsumptionPoint, Granularity, Period, Prices } from '../types';
import { pointCost } from './states';

/** The locale-aware, 12h/24h-preference-aware formatters from `useLocale()`. */
export interface LabelFormatters {
  formatDate: PluginLocale['formatDate'];
  formatTime: PluginLocale['formatTime'];
}

export type ChartStyle = 'bar' | 'area' | 'line';

const VALID_PERIODS: Period[] = ['24h', '7d', '30d', '12m', '24m'];

type Config = Record<string, unknown> | null | undefined;

export function resolveStyle(config: Config): ChartStyle {
  const v = config?.style;
  if (v === 'area' || v === 'line' || v === 'bar') {
    return v;
  }
  return 'bar';
}

export function resolvePeriod(config: Config): Period {
  const v = config?.period;
  if (typeof v === 'string' && (VALID_PERIODS as string[]).includes(v)) {
    return v as Period;
  }
  return '12m';
}

export function formatLabel(
  timestamp: number,
  granularity: Granularity,
  fmt: LabelFormatters
): string {
  switch (granularity) {
    case 'minute':
    case 'hour':
      return fmt.formatTime(timestamp, { hour: '2-digit', minute: '2-digit' });
    case 'month':
      return fmt.formatDate(timestamp, { month: 'short', year: '2-digit' });
    default:
      return fmt.formatDate(timestamp, { day: 'numeric', month: 'short' });
  }
}

export interface ChartRow {
  ts: number;
  total: number;
  injection: number;
  cost: number;
  label: string;
}

export function buildRows(
  points: ConsumptionPoint[],
  granularity: Granularity,
  fmt: LabelFormatters,
  prices: Prices
): ChartRow[] {
  return points.map((p) => {
    const ts = new Date(p.timestamp).getTime();
    return {
      ts,
      total: Number(p.total.toFixed(2)),
      injection: Number(p.injection.toFixed(2)),
      cost: Number(pointCost(p, prices).toFixed(2)),
      label: formatLabel(ts, granularity, fmt),
    };
  });
}
