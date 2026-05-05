import { useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { ConsumptionPoint, ElectricityState } from '../types';
import { formatChf, formatKwh, Loader, pointCost } from '../ui/states';

function currentAndPreviousMonth(points: ConsumptionPoint[]): { current: number; previous: number } {
  const last = points.at(-1);
  const prev = points.at(-2);
  return { current: last?.total ?? 0, previous: prev?.total ?? 0 };
}

function trendPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function NoCredentials() {
  const { t } = useLocale();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
      <Zap className="size-6 text-yellow-400/50" />
      <p className="text-[10px] text-white/50">{t('ui.noCookie')}</p>
    </div>
  );
}

function Sparkline({ points }: Readonly<{ points: ConsumptionPoint[] }>) {
  if (points.length < 2) return null;
  const recent = points.slice(-6);
  const max = Math.max(...recent.map((p) => p.total), 1);
  return (
    <div className="flex gap-2">
      {recent.map((p) => {
        const h = Math.max(Math.round((p.total / max) * 24), 2);
        return (
          <div key={p.timestamp} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex flex-col justify-end" style={{ height: 24 }}>
              <div className="w-full rounded-sm bg-yellow-400/70" style={{ height: h }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ElectricitySummary() {
  const state = useBrickData<ElectricityState>();
  const { t, locale } = useLocale();

  const data = state?.periods?.['12m']?.data;

  if (!state) return <Loader tone="yellow" />;
  if (!state.credentialsSet) return <NoCredentials />;
  if (!data || data.points.length === 0) return <Loader tone="yellow" />;

  const last = data.points.at(-1);
  if (!last) return <Loader tone="yellow" />;

  const { current, previous } = currentAndPreviousMonth(data.points);
  const trend = trendPercent(current, previous);
  const periodLabel = new Date(last.timestamp).toLocaleDateString(
    locale,
    data.granularity === 'month'
      ? { month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' },
  );

  return (
    <div className="flex h-full flex-col justify-between rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/50">{t('ui.consumption')}</p>
          <p className="text-[10px] text-white/40">{periodLabel}</p>
        </div>
        <Zap className="size-4 text-yellow-400/70" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-bold leading-none text-white tabular-nums">
          {formatKwh(current)}
        </span>
        <span className="text-[10px] text-white/50">
          ≈ {formatChf(pointCost(last, state.prices))}
        </span>
        {trend !== null && (
          <div className="flex items-center gap-1">
            {trend > 0 ? (
              <TrendingUp className="size-3 text-red-400" />
            ) : (
              <TrendingDown className="size-3 text-green-400" />
            )}
            <span className={`text-[10px] font-medium ${trend > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {trend > 0 ? '+' : ''}
              {trend}% {t('ui.vsPrevious')}
            </span>
          </div>
        )}
      </div>

      <Sparkline points={data.points} />
    </div>
  );
}
