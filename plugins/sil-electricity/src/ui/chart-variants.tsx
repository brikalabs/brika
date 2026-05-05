/**
 * Three chart variants — Bar / Area / Line — sharing the same axes and tooltip.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartRow } from './chart-helpers';
import { formatChf, formatKwh } from './states';

const TOTAL_COLOR = '#3b82f6';
const INJECTION_COLOR = '#22c55e';
const MARGIN = { top: 4, right: 4, left: 0, bottom: 0 };

export interface RenderProps {
  rows: ChartRow[];
  hasInjection: boolean;
  gradId: string;
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-white/10 bg-slate-900/95 px-2 py-1.5 text-xs shadow-md backdrop-blur">
      <div className="font-medium text-white">{label}</div>
      <div className="text-blue-300">{formatKwh(row.total)}</div>
      {row.injection > 0 && (
        <div className="text-green-300">+{formatKwh(row.injection)} inj.</div>
      )}
      <div className="text-violet-300">{formatChf(row.cost)}</div>
    </div>
  );
}

function ChartAxes() {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
        minTickGap={20}
      />
      <YAxis
        tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)' }}
        tickLine={false}
        axisLine={false}
        width={32}
      />
      <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
    </>
  );
}

export function BarVariant({ rows, hasInjection }: Readonly<RenderProps>) {
  return (
    <BarChart data={rows} margin={MARGIN}>
      <ChartAxes />
      <Bar dataKey="total" fill={TOTAL_COLOR} radius={[2, 2, 0, 0]} />
      {hasInjection && (
        <Bar dataKey="injection" fill={INJECTION_COLOR} radius={[2, 2, 0, 0]} opacity={0.7} />
      )}
    </BarChart>
  );
}

export function AreaVariant({ rows, hasInjection, gradId }: Readonly<RenderProps>) {
  return (
    <AreaChart data={rows} margin={MARGIN}>
      <defs>
        <linearGradient id={`${gradId}-total`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={TOTAL_COLOR} stopOpacity={0.4} />
          <stop offset="95%" stopColor={TOTAL_COLOR} stopOpacity={0} />
        </linearGradient>
        {hasInjection && (
          <linearGradient id={`${gradId}-injection`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={INJECTION_COLOR} stopOpacity={0.4} />
            <stop offset="95%" stopColor={INJECTION_COLOR} stopOpacity={0} />
          </linearGradient>
        )}
      </defs>
      <ChartAxes />
      <Area
        type="monotone"
        dataKey="total"
        stroke={TOTAL_COLOR}
        strokeWidth={2}
        fill={`url(#${gradId}-total)`}
        connectNulls
      />
      {hasInjection && (
        <Area
          type="monotone"
          dataKey="injection"
          stroke={INJECTION_COLOR}
          strokeWidth={2}
          fill={`url(#${gradId}-injection)`}
          connectNulls
        />
      )}
    </AreaChart>
  );
}

export function LineVariant({ rows, hasInjection }: Readonly<RenderProps>) {
  return (
    <LineChart data={rows} margin={MARGIN}>
      <ChartAxes />
      <Line type="monotone" dataKey="total" stroke={TOTAL_COLOR} strokeWidth={2} dot={false} connectNulls />
      {hasInjection && (
        <Line
          type="monotone"
          dataKey="injection"
          stroke={INJECTION_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      )}
    </LineChart>
  );
}
