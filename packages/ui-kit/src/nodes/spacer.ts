import type { BaseNode } from './_shared';

export interface SpacerNode extends BaseNode {
  type: 'spacer';
  /** Fixed size. When omitted, spacer flexes to fill available space. */
  size?: 'sm' | 'md' | 'lg';
}

export function Spacer(props?: { size?: 'sm' | 'md' | 'lg' }): SpacerNode {
  return { type: 'spacer', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    spacer: SpacerNode;
  }
}
