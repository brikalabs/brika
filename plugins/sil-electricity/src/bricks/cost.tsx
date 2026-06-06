import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Banknote } from 'lucide-react';
import { costData } from '../brick-data';
import type { ConsumptionPoint, Prices } from '../types';
import {
  CompactStat,
  formatChf,
  Loader,
  NoCredentials,
  PeriodPlaceholder,
  pointCost,
  TrendRow,
  trendPercent,
  useSizeTier,
} from '../ui/states';

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
  const state = costData.use();
  const { t, locale } = useLocale();
  const tier = useSizeTier();

  const periodState = state?.periods?.['12m'];
  const data = periodState?.data;

  if (!state) {
    return <Loader tone="violet" />;
  }
  if (!state.credentialsSet) {
    return <NoCredentials icon={Banknote} accent="text-data-5/60" />;
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
      <CompactStat
        icon={Banknote}
        accent="text-data-5"
        value={formatChf(current)}
        label={t('ui.estimatedCost')}
      />
    );
  }

  const trendRow = trend !== null && <TrendRow trend={trend} label={t('ui.vsPrevious')} />;

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
