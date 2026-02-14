import type { BaseNode } from './_shared';

export interface DividerNode extends BaseNode {
  type: 'divider';
  /** Line direction (default: horizontal) */
  direction?: 'horizontal' | 'vertical';
  /** Custom color (default: border/50) */
  color?: string;
  /** Optional label displayed centered within the divider */
  label?: string;
}

export function Divider(props?: {
  direction?: 'horizontal' | 'vertical';
  color?: string;
  label?: string;
}): DividerNode {
  return { type: 'divider', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    divider: DividerNode;
  }
}
