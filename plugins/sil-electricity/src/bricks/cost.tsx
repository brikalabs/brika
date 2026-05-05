import { useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Banknote, TrendingDown, TrendingUp } from 'lucide-react';
import type { ConsumptionPoint, ElectricityState, Prices } from '../types';
import { formatChf, Loader, pointCost } from '../ui/states';

function NoCredentials() {
  const { t } = useLocale();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
      <Banknote className="size-6 text-data-5/60" />
      <p className="text-[10px] text-muted-foreground">{t('ui.noCookie')}</p>
    </div>
  );
}

function trendPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function lastTwoCosts(points: ConsumptionPoint[], prices: Prices): { current: number; previous: number } {
  const last = points.at(-1);
  const prev = points.at(-2);
  return {
    current: last ? pointCost(last, prices) : 0,
    previous: prev ? pointCost(prev, prices) : 0,
  };
}

export default function ElectricityCost() {
  const state = useBrickData<ElectricityState>();
  const { t, locale } = useLocale();

  const data = state?.periods?.['12m']?.data;

  if (!state) return <Loader tone="violet" />;
  if (!state.credentialsSet) return <NoCredentials />;
  if (!data || data.points.length === 0) return <Loader tone="violet" />;

  const last = data.points.at(-1);
  if (!last) return <Loader tone="violet" />;

  const { current, previous } = lastTwoCosts(data.points, state.prices);
  const trend = trendPercent(current, previous);
  const periodLabel = new Date(last.timestamp).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex h-full flex-col justify-between p-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('ui.estimatedCost')}
          </p>
          <p className="text-[10px] text-muted-foreground/70">{periodLabel}</p>
        </div>
        <Banknote className="size-4 text-data-5" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-bold leading-none text-foreground tabular-nums">
          {formatChf(current)}
        </span>
        {trend !== null && (
          <div className="flex items-center gap-1">
            {trend > 0 ? (
              <TrendingUp className="size-3 text-destructive" />
            ) : (
              <TrendingDown className="size-3 text-success" />
            )}
            <span
              className={`text-[10px] font-medium ${trend > 0 ? 'text-destructive' : 'text-success'}`}
            >
              {trend > 0 ? '+' : ''}
              {trend}% {t('ui.vsPrevious')}
            </span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/70">
        @ {formatChf(state.prices.perKwh)}/kWh
      </p>
    </div>
  );
}
