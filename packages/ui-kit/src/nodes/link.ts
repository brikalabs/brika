import type { BaseNode } from './_shared';

export interface LinkNode extends BaseNode {
  type: 'link';
  /** Display text */
  label: string;
  /** URL to open in a new tab */
  url: string;
  /** Lucide icon name */
  icon?: string;
  /** Visual style */
  variant?: 'default' | 'muted' | 'underline';
  /** Font size */
  size?: 'xs' | 'sm' | 'md';
}

export function Link(props: Omit<LinkNode, 'type'>): LinkNode {
  return {
    type: 'link',
    ...props,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    link: LinkNode;
  }
}
