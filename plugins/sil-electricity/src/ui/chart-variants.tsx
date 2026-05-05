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

// Pull from clay's data-viz palette so charts retint with the active theme.
// SVG attributes accept CSS variables in modern browsers; recharts forwards
// `fill` / `stroke` / `stopColor` straight onto the underlying elements.
const TOTAL_COLOR = 'var(--color-data-1)';
const INJECTION_COLOR = 'var(--color-data-3)';
const TICK_COLOR = 'var(--color-muted-foreground)';
const CURSOR_COLOR = 'var(--color-foreground)';
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
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      <div className="text-data-1">{formatKwh(row.total)}</div>
      {row.injection > 0 && (
        <div className="text-data-3">+{formatKwh(row.injection)} inj.</div>
      )}
      <div className="text-data-5">{formatChf(row.cost)}</div>
    </div>
  );
}

function ChartAxes() {
  return (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke={CURSOR_COLOR}
        strokeOpacity={0.1}
        vertical={false}
      />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 9, fill: TICK_COLOR }}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
        minTickGap={20}
      />
      <YAxis
        tick={{ fontSize: 9, fill: TICK_COLOR }}
        tickLine={false}
        axisLine={false}
        width={32}
      />
      <Tooltip
        content={ChartTooltip}
        cursor={{ fill: CURSOR_COLOR, fillOpacity: 0.06 }}
      />
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
