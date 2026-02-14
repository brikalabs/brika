import type { ChartNode, ChartSeries } from '@brika/ui-kit';
import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const DEFAULT_COLORS = [
  'var(--color-primary)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

function ChartTooltip({
  active,
  payload,
}: Readonly<{
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
}>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-sm shadow-md">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {payload.length > 1 && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
          )}
          <span>{(entry.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Build effective series from the node: multi-series if present, else single series from data/color */
function buildSeries(node: ChartNode): ChartSeries[] {
  if (node.series && node.series.length > 0) return node.series;
  return [{ key: 'value', data: node.data, color: node.color }];
}

/** Merge multiple series into a flat data array keyed by `ts` for Recharts */
function mergeSeriesData(series: ChartSeries[]): Record<string, number | undefined>[] {
  if (series.length === 1) {
    // Fast path: single series, no merging needed
    return series[0].data.map((d) => ({ ts: d.ts, [series[0].key]: d.value }));
  }

  const map = new Map<number, Record<string, number | undefined>>();
  for (const s of series) {
    for (const d of s.data) {
      let row = map.get(d.ts);
      if (!row) {
        row = { ts: d.ts };
        map.set(d.ts, row);
      }
      row[s.key] = d.value;
    }
  }
  return [...map.values()].sort((a, b) => (a.ts as number) - (b.ts as number));
}

export function BrickChart({ node }: Readonly<{ node: ChartNode }>) {
  const baseId = useId();
  const series = useMemo(() => buildSeries(node), [node.series, node.data, node.color]);
  const mergedData = useMemo(() => mergeSeriesData(series), [series]);

  if (mergedData.length === 0) return null;

  const margin = { top: 2, right: 2, left: 2, bottom: 2 };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {node.label && <span className="shrink-0 text-muted-foreground text-xs">{node.label}</span>}
      <div className="min-h-0 flex-1" style={{ minHeight: 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          {node.variant === 'bar' ? (
            <BarChart data={mergedData} margin={margin}>
              {node.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />}
              <XAxis dataKey="ts" hide={!node.showXAxis} tick={{ fontSize: 10 }} />
              <YAxis hide={!node.showYAxis} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={ChartTooltip} />
              {node.showLegend && series.length > 1 && (
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              )}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  opacity={0.8}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={mergedData} margin={margin}>
              <defs>
                {series.map((s, i) => {
                  const color = s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                  return (
                    <linearGradient
                      key={s.key}
                      id={`${baseId}-${s.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              {node.showGrid && <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />}
              <XAxis dataKey="ts" hide={!node.showXAxis} tick={{ fontSize: 10 }} />
              <YAxis hide={!node.showYAxis} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={ChartTooltip} />
              {node.showLegend && series.length > 1 && (
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              )}
              {series.map((s, i) => {
                const color = s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                return node.variant === 'line' ? (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label ?? s.key}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ) : (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label ?? s.key}
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${baseId}-${s.key})`}
                    connectNulls
                  />
                );
              })}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
