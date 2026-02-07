import type { BaseNode } from './_shared';

export interface ChartDataPoint {
  ts: number;
  value: number;
}

export interface ChartNode extends BaseNode {
  type: 'chart';
  variant: 'line' | 'area' | 'bar';
  data: ChartDataPoint[];
  color?: string;
  label?: string;
  height?: number;
}

export function Chart(props: Omit<ChartNode, 'type'>): ChartNode {
  return { type: 'chart', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    chart: ChartNode;
  }
}
