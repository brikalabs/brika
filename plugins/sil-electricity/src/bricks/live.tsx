import { type PluginLocale, useLocale } from '@brika/sdk/ui-kit/hooks';
import { Activity, Zap } from 'lucide-react';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
} from 'recharts';
import type { ConsumptionPoint } from '../types';
import {
  formatKwh,
  formatPower,
  kwhToWatts,
  Loader,
  Message,
  PeriodPlaceholder,
  useSizeTier,
} from '../ui/states';
import { liveBrick } from './live.brick';

const ACCENT = 'var(--color-data-3)';

// Most recent 15-minute readings to plot: one day's worth (96 quarter-hours).
// The fetch window is wider (a week, to clear SIL's publish lag), so the brick
// trims down to the latest day of activity it actually received.
const LIVE_WINDOW = 96;

type FormatTime = PluginLocale['formatTime'];

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
  /** Full ISO timestamp: the X axis key. Unique, so the active dot stays put. */
  ts: string;
  watts: number;
  /** Human "HH:MM" shown in the tooltip. */
  label: string;
}

function buildRows(points: ConsumptionPoint[], formatTime: FormatTime): Row[] {
  return points.map((p) => ({
    ts: p.timestamp,
    watts: kwhToWatts(p.total - p.injection),
    label: formatTime(new Date(p.timestamp)),
  }));
}

function LiveTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const point = payload?.[0];
  if (!active || !point) {
    return null;
  }
  // The X axis is keyed on the unique timestamp (so the highlighted dot tracks
  // the cursor); the readable time lives on the row payload, not the axis label.
  const time = String(point.payload?.label ?? '');
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md">
      <div className="text-muted-foreground">{time}</div>
      <div className="font-medium text-data-3">{formatPower(Number(point.value ?? 0))}</div>
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
  const state = liveBrick.data.use();
  const { t, formatTime } = useLocale();

  const periodState = state?.periods?.['24h'];
  const data = periodState?.data;
  const recent = useMemo(() => (data ? data.points.slice(-LIVE_WINDOW) : []), [data]);
  const rows = useMemo(() => buildRows(recent, formatTime), [recent, formatTime]);
  const tier = useSizeTier();

  if (!state) {
    return <Loader tone="emerald" />;
  }
  if (!state.credentialsSet) {
    return <NoCredentials />;
  }
  // A login/network/rate-limit fault gets its own explanatory message.
  if (periodState?.error) {
    return <PeriodPlaceholder error={periodState.error} tone="emerald" />;
  }
  // No period state yet, or the first poll is still in flight: keep spinning.
  if (!data) {
    return <Loader tone="emerald" />;
  }

  const last = recent.at(-1);
  // Poll succeeded but SIL has published nothing in the fetched window. Say so
  // instead of spinning forever (the prior bug, since the window was too narrow).
  if (!last || rows.length === 0) {
    return <Message icon={Activity} text={t('ui.noRecentData')} />;
  }

  const liveWatts = kwhToWatts(last.total - last.injection);
  const todayKwh = data.points.filter((p) => isToday(p.timestamp)).reduce((s, p) => s + p.total, 0);

  const chart = (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="live-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={ACCENT} stopOpacity={0.5} />
            <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="ts" hide />
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
  );

  // Tiny card: just the headline power, centered, so a 1-cell card never clips.
  if (tier === 'compact') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1 text-center">
        <Activity className="size-4 text-data-3" />
        <span className="font-bold text-foreground text-xl tabular-nums leading-none">
          {formatPower(liveWatts)}
        </span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
          {t('ui.live')}
        </span>
      </div>
    );
  }

  // Wide-but-short card (3x2 / 4x2): stat on the left, chart fills the right.
  if (tier === 'wide') {
    return (
      <div className="flex h-full items-stretch gap-2 p-1">
        <div className="flex min-w-0 flex-col justify-center">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.live')}
          </p>
          <span className="font-bold text-2xl text-foreground tabular-nums leading-tight">
            {formatPower(liveWatts)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {t('ui.todayTotal')}: {formatKwh(todayKwh)}
          </span>
        </div>
        <div className="min-h-0 min-w-0 flex-1">{chart}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('ui.live')}
          </p>
          <p className="truncate text-[10px] text-muted-foreground/70">
            {t('ui.lastReading')} {formatTime(new Date(last.timestamp))}
          </p>
        </div>
        <Activity className="size-4 shrink-0 text-data-3" />
      </div>

      <div className="flex flex-col gap-0.5 py-2">
        <span className="font-bold text-2xl text-foreground tabular-nums leading-none">
          {formatPower(liveWatts)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {t('ui.todayTotal')}: {formatKwh(todayKwh)}
        </span>
      </div>

      {tier === 'full' && <div className="min-h-0 flex-1">{chart}</div>}
    </div>
  );
}
