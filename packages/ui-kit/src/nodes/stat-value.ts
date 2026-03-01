import type { ColorValue } from '../colors';
import type { BaseNode } from './_shared';

export interface StatValueNode extends BaseNode {
  type: 'stat-value';
  label: string;
  value: number | string;
  unit?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'flat';
  color?: ColorValue;
  /** Display value of the trend change (e.g. "+5.2%") */
  trendValue?: string;
  /** Sub-label / description below the value */
  description?: string;
}

export function Stat(props: Omit<StatValueNode, 'type'>): StatValueNode {
  return {
    type: 'stat-value',
    ...props,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    'stat-value': StatValueNode;
  }
}
