import type { BaseNode } from './_shared';

export interface ProgressNode extends BaseNode {
  type: 'progress';
  /** Progress value (0-100) */
  value: number;
  /** Optional label above the bar */
  label?: string;
  /** Bar color (default: primary) */
  color?: string;
  /** Show percentage text */
  showValue?: boolean;
}

export function Progress(props: Omit<ProgressNode, 'type'>): ProgressNode {
  return { type: 'progress', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    progress: ProgressNode;
  }
}
