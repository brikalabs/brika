import { useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Activity, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import type { ConsumptionPoint, ElectricityState } from '../types';
import { formatKwh, formatPower, kwhToWatts, Loader } from '../ui/states';

const ACCENT = 'var(--color-data-3)';

function formatTime(timestamp: string, locale: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function isToday(timestamp: string): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface Row {
  ts: number;
  watts: number;
}

function buildRows(points: ConsumptionPoint[]): Row[] {
  return points.map((p) => ({
    ts: new Date(p.timestamp).getTime(),
    watts: kwhToWatts(p.total - p.injection),
  }));
}

function LiveTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }
  const watts = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md">
      <div className="text-muted-foreground">{new Date(Number(label)).toLocaleTimeString()}</div>
      <div className="font-medium text-data-3">{formatPower(Number(watts))}</div>
    </div>
  );
}

function NoCredentials() {
  const { t } = useLocale();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
      <Zap className="size-6 text-data-3/60" />
      <p className="text-[10px] text-muted-foreground">{t('ui.noCookie')}</p>
    </div>
  );
}

export default function LiveConsumption() {
  const state = useBrickData<ElectricityState>();
  const { t, locale } = useLocale();

  const data = state?.periods?.['24h']?.data;
  const rows = useMemo(() => (data ? buildRows(data.points) : []), [data]);

  if (!state) {
    return <Loader tone="emerald" />;
  }
  if (!state.credentialsSet) {
    return <NoCredentials />;
  }
  if (!data || rows.length === 0) {
    return <Loader tone="emerald" />;
  }

  const last = data.points.at(-1);
  if (!last) {
    return <Loader tone="emerald" />;
  }

  const liveWatts = kwhToWatts(last.total - last.injection);
  const todayKwh = data.points.filter((p) => isToday(p.timestamp)).reduce((s, p) => s + p.total, 0);

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.live')}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            {t('ui.lastReading')} {formatTime(last.timestamp, locale)}
          </p>
        </div>
        <Activity className="size-4 text-data-3" />
      </div>

      <div className="flex flex-col gap-0.5 py-2">
        <span className="font-bold text-2xl text-foreground tabular-nums leading-none">
          {formatPower(liveWatts)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {t('ui.todayTotal')}: {formatKwh(todayKwh)}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="live-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.5} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={LiveTooltip} cursor={{ stroke: ACCENT, strokeOpacity: 0.3 }} />
            <Area
              type="monotone"
              dataKey="watts"
              stroke={ACCENT}
              strokeWidth={1.5}
              fill="url(#live-grad)"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
