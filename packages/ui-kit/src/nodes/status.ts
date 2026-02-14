import type { ColorValue } from '../colors';
import type { BaseNode } from './_shared';

export interface StatusNode extends BaseNode {
  type: 'status';
  label: string;
  status: 'online' | 'offline' | 'warning' | 'error' | 'idle';
  icon?: string;
  color?: ColorValue;
}

export function Status(props: Omit<StatusNode, 'type'>): StatusNode {
  return { type: 'status', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    status: StatusNode;
  }
}
