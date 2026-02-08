import type { BaseNode } from './_shared';

export interface IconNode extends BaseNode {
  type: 'icon';
  /** Lucide icon name */
  name: string;
  /** Display size */
  size?: 'sm' | 'md' | 'lg';
  /** Icon color */
  color?: string;
}

export function Icon(props: Omit<IconNode, 'type'>): IconNode {
  return { type: 'icon', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    icon: IconNode;
  }
}
