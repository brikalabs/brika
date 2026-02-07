import type { ChartNode } from '@brika/ui-kit';
import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value: number }>;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-sm shadow-md">
      {payload[0].value.toLocaleString()}
    </div>
  );
}

export function BrickChart({ node }: { node: ChartNode }) {
  if (node.data.length === 0) return null;

  const color = node.color ?? 'var(--color-primary)';
  const gradientId = useId();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {node.label && <span className="shrink-0 text-muted-foreground text-xs">{node.label}</span>}
      <div className="min-h-0 flex-1" style={{ minHeight: 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          {node.variant === 'bar' ? (
            <BarChart data={node.data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <XAxis dataKey="ts" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={ChartTooltip} />
              <Bar dataKey="value" fill={color} opacity={0.8} radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={node.data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={ChartTooltip} />
              {node.variant === 'line' ? (
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
              ) : (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
