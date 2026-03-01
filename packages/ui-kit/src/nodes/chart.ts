import type { ColorValue } from '../colors';
import type { BaseNode } from './_shared';

export interface ChartDataPoint {
  ts: number;
  value: number;
}

export interface ChartSeries {
  key: string;
  label?: string;
  data: ChartDataPoint[];
  color?: ColorValue;
}

export interface ChartNode extends BaseNode {
  type: 'chart';
  variant: 'line' | 'area' | 'bar';
  data: ChartDataPoint[];
  color?: ColorValue;
  label?: string;
  height?: number;
  /** Multi-series data — when present, overrides data and color */
  series?: ChartSeries[];
  /** Show X-axis labels */
  showXAxis?: boolean;
  /** Show Y-axis labels */
  showYAxis?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show legend for multi-series */
  showLegend?: boolean;
}

export function Chart(props: Omit<ChartNode, 'type'>): ChartNode {
  return {
    type: 'chart',
    ...props,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    chart: ChartNode;
  }
}
