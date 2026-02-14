import type { ColorValue } from '../colors';
import type { BaseNode } from './_shared';

export interface KeyValueItem {
  label: string;
  value: string | number;
  icon?: string;
  color?: ColorValue;
  copyable?: boolean;
}

export interface KeyValueNode extends BaseNode {
  type: 'key-value';
  items: KeyValueItem[];
  /** Label/value arrangement */
  layout?: 'horizontal' | 'stacked';
  /** Show dividers between items */
  dividers?: boolean;
  /** Compact spacing */
  compact?: boolean;
}

export function KeyValue(props: Omit<KeyValueNode, 'type'>): KeyValueNode {
  return { type: 'key-value', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    'key-value': KeyValueNode;
  }
}
