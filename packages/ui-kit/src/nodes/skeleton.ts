import type { BaseNode } from './_shared';

export interface SkeletonNode extends BaseNode {
  type: 'skeleton';
  /** Shape of the skeleton placeholder */
  variant: 'text' | 'circle' | 'rect';
  /** Width (CSS value, e.g. "100%", "80px") */
  width?: string;
  /** Height (CSS value) */
  height?: string;
  /** Number of lines (for 'text' variant) */
  lines?: number;
}

export function Skeleton(props: Omit<SkeletonNode, 'type'>): SkeletonNode {
  return { type: 'skeleton', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    skeleton: SkeletonNode;
  }
}
