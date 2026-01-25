'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

interface MetricsChartProps {
  data: Array<{ ts: number; value: number }>;
  color?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

export function MetricsChart({
  data,
  color = 'var(--color-primary)',
  formatValue = (v) => v.toFixed(1),
  className,
}: Readonly<MetricsChartProps>) {
  const gradientId = `gradient-${color.replaceAll(/[^a-zA-Z0-9]/g, '')}`;
  const hasData = data.length > 0;

  // Show empty placeholder when no data
  if (!hasData) {
    return (
      <div className={cn('flex h-20 w-full items-center justify-center', className)}>
        <div className="h-px w-full opacity-20" style={{ backgroundColor: color }} />
      </div>
    );
  }

  return (
    <div className={cn('h-20 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload?.[0]) {
                return (
                  <div className="rounded-md border bg-popover px-2 py-1 text-sm shadow-md">
                    {formatValue(payload[0].value as number)}
                  </div>
                );
              }
              return null;
            }}
          />
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
