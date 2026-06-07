import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Zap } from 'lucide-react';
import type { ConsumptionPoint } from '../types';
import {
  CompactStat,
  formatChf,
  formatKwh,
  Loader,
  NoCredentials,
  PeriodPlaceholder,
  pointCost,
  TrendRow,
  trendPercent,
  useSizeTier,
} from '../ui/states';
import { summaryBrick } from './summary.brick';

function currentAndPreviousMonth(points: ConsumptionPoint[]): {
  current: number;
  previous: number;
} {
  const last = points.at(-1);
  const prev = points.at(-2);
  return { current: last?.total ?? 0, previous: prev?.total ?? 0 };
}

function Sparkline({ points }: Readonly<{ points: ConsumptionPoint[] }>) {
  if (points.length < 2) {
    return null;
  }
  const recent = points.slice(-6);
  const max = Math.max(...recent.map((p) => p.total), 1);
  return (
    <div className="flex gap-2">
      {recent.map((p) => {
        const h = Math.max(Math.round((p.total / max) * 24), 2);
        return (
          <div key={p.timestamp} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex flex-col justify-end" style={{ height: 24 }}>
              <div className="w-full rounded-sm bg-data-6/70" style={{ height: h }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ElectricitySummary() {
  const state = summaryBrick.data.use();
  const { t, locale } = useLocale();
  const tier = useSizeTier();

  const periodState = state?.periods?.['12m'];
  const data = periodState?.data;

  if (!state) {
    return <Loader tone="yellow" />;
  }
  if (!state.credentialsSet) {
    return <NoCredentials icon={Zap} accent="text-data-6/60" />;
  }
  if (!data || data.points.length === 0) {
    return <PeriodPlaceholder error={periodState?.error} tone="yellow" />;
  }

  const last = data.points.at(-1);
  if (!last) {
    return <PeriodPlaceholder error={periodState?.error} tone="yellow" />;
  }

  const { current, previous } = currentAndPreviousMonth(data.points);
  const trend = trendPercent(current, previous);
  const periodLabel = new Date(last.timestamp).toLocaleDateString(
    locale,
    data.granularity === 'month'
      ? { month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' }
  );

  if (tier === 'compact') {
    return (
      <CompactStat
        icon={Zap}
        accent="text-data-6"
        value={formatKwh(current)}
        label={t('ui.consumption')}
      />
    );
  }

  const trendRow = trend !== null && <TrendRow trend={trend} label={t('ui.vsPrevious')} />;

  // Wide-but-short card (3x2 / 4x2): stat on the left, sparkline fills the right.
  if (tier === 'wide') {
    return (
      <div className="flex h-full items-center gap-2 p-1">
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.consumption')}
          </p>
          <span className="font-bold text-2xl text-foreground tabular-nums leading-tight">
            {formatKwh(current)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            ≈ {formatChf(pointCost(last, state.prices))}
          </span>
          {trendRow}
        </div>
        <div className="flex flex-1 items-center">
          <Sparkline points={data.points} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between p-1">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.consumption')}
          </p>
          <p className="truncate text-[10px] text-muted-foreground/70">{periodLabel}</p>
        </div>
        <Zap className="size-4 shrink-0 text-data-6" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-bold text-2xl text-foreground tabular-nums leading-none">
          {formatKwh(current)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ≈ {formatChf(pointCost(last, state.prices))}
        </span>
        {trendRow}
      </div>

      {tier === 'full' && <Sparkline points={data.points} />}
    </div>
  );
}
