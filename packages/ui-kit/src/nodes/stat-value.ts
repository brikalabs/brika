import type { BaseNode } from './_shared';

export interface StatValueNode extends BaseNode {
  type: 'stat-value';
  label: string;
  value: number | string;
  unit?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'flat';
  color?: string;
}

export function Stat(props: Omit<StatValueNode, 'type'>): StatValueNode {
  return { type: 'stat-value', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    'stat-value': StatValueNode;
  }
}
