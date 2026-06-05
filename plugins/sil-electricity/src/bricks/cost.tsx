import { useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Banknote, TrendingDown, TrendingUp } from 'lucide-react';
import type { ConsumptionPoint, ElectricityState, Prices } from '../types';
import { formatChf, Loader, PeriodPlaceholder, pointCost, useSizeTier } from '../ui/states';

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
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function lastTwoCosts(
  points: ConsumptionPoint[],
  prices: Prices
): { current: number; previous: number } {
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
  const tier = useSizeTier();

  const periodState = state?.periods?.['12m'];
  const data = periodState?.data;

  if (!state) {
    return <Loader tone="violet" />;
  }
  if (!state.credentialsSet) {
    return <NoCredentials />;
  }
  if (!data || data.points.length === 0) {
    return <PeriodPlaceholder error={periodState?.error} tone="violet" />;
  }

  const last = data.points.at(-1);
  if (!last) {
    return <PeriodPlaceholder error={periodState?.error} tone="violet" />;
  }

  const { current, previous } = lastTwoCosts(data.points, state.prices);
  const trend = trendPercent(current, previous);
  const periodLabel = new Date(last.timestamp).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  if (tier === 'compact') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1 text-center">
        <Banknote className="size-4 text-data-5" />
        <span className="font-bold text-foreground text-xl tabular-nums leading-none">
          {formatChf(current)}
        </span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
          {t('ui.estimatedCost')}
        </span>
      </div>
    );
  }

  const trendRow = trend !== null && (
    <div className="flex items-center gap-1">
      {trend > 0 ? (
        <TrendingUp className="size-3 text-destructive" />
      ) : (
        <TrendingDown className="size-3 text-success" />
      )}
      <span
        className={`font-medium text-[10px] ${trend > 0 ? 'text-destructive' : 'text-success'}`}
      >
        {trend > 0 ? '+' : ''}
        {trend}% {t('ui.vsPrevious')}
      </span>
    </div>
  );

  // Wide-but-short card (3x2 / 4x2): cost + trend on the left, the per-kWh rate
  // on the right, so the spare width is used rather than left empty.
  if (tier === 'wide') {
    return (
      <div className="flex h-full items-center justify-between gap-2 p-1">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.estimatedCost')}
          </p>
          <span className="font-bold text-2xl text-foreground tabular-nums leading-tight">
            {formatChf(current)}
          </span>
          {trendRow}
        </div>
        <p className="shrink-0 text-[10px] text-muted-foreground/70">
          @ {formatChf(state.prices.perKwh)}/kWh
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between p-1">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.estimatedCost')}
          </p>
          <p className="truncate text-[10px] text-muted-foreground/70">{periodLabel}</p>
        </div>
        <Banknote className="size-4 shrink-0 text-data-5" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-bold text-2xl text-foreground tabular-nums leading-none">
          {formatChf(current)}
        </span>
        {trendRow}
      </div>

      {tier === 'full' && (
        <p className="text-[10px] text-muted-foreground/70">
          @ {formatChf(state.prices.perKwh)}/kWh
        </p>
      )}
    </div>
  );
}
