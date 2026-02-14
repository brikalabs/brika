import type { ColorValue } from '../colors';
import type { BaseNode } from './_shared';

export interface ProgressNode extends BaseNode {
  type: 'progress';
  /** Progress value (0-100) */
  value: number;
  /** Optional label above the bar */
  label?: string;
  /** Bar color (default: primary) */
  color?: ColorValue;
  /** Show percentage text */
  showValue?: boolean;
  /** Bar thickness */
  size?: 'sm' | 'md' | 'lg';
  /** Visual style */
  variant?: 'bar' | 'ring';
}

export function Progress(props: Omit<ProgressNode, 'type'>): ProgressNode {
  return { type: 'progress', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    progress: ProgressNode;
  }
}
