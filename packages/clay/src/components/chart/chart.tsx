'use client';

import { useCallback } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../../primitives/cn';

function ChartTooltipContent({
  active,
  payload,
  formatValue,
}: Readonly<{
  active?: boolean;
  payload?: ReadonlyArray<{
    value?: unknown;
  }>;
  formatValue: (value: number) => string;
}>) {
  if (active && payload?.[0]?.value !== null && payload?.[0]?.value !== undefined) {
    return (
      <div className="rounded-control border bg-popover px-2 py-1 text-sm shadow-overlay">
        {formatValue(Number(payload[0].value))}
      </div>
    );
  }
  return null;
}

interface ChartProps {
  /** Array of `{ts, value}` points plotted on the area chart. */
  data: Array<{
    ts: number;
    value: number;
  }>;
  /** Line and gradient color; defaults to `var(--color-primary)`. */
  color?: string;
  /** Formatter for the y-axis and tooltip readout. */
  formatValue?: (value: number) => string;
  /** Extra Tailwind classes appended to the chart wrapper. */
  className?: string;
}

export function Chart({
  data,
  color = 'var(--color-primary)',
  formatValue = (v) => v.toFixed(1),
  className,
}: Readonly<ChartProps>) {
  const gradientId = `gradient-${color.replaceAll(/[^a-zA-Z0-9]/g, '')}`;
  const hasData = data.length > 0;
  const renderTooltip = useCallback(
    (props: {
      active?: boolean;
      payload?: ReadonlyArray<{
        value?: unknown;
      }>;
    }) => <ChartTooltipContent {...props} formatValue={formatValue} />,
    [formatValue]
  );

  // Show empty placeholder when no data
  if (!hasData) {
    return (
      <div className={cn('flex h-20 w-full items-center justify-center', className)}>
        <div
          className="h-px w-full opacity-20"
          style={{
            backgroundColor: color,
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn('h-20 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 5,
            right: 5,
            left: 5,
            bottom: 5,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={renderTooltip} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
