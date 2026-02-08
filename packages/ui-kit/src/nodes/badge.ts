import type { BaseNode } from './_shared';

export interface BadgeNode extends BaseNode {
  type: 'badge';
  label: string;
  /** Semantic variant */
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
  /** Lucide icon name */
  icon?: string;
  /** Custom tint color (overrides variant) */
  color?: string;
}

export function Badge(props: Omit<BadgeNode, 'type'>): BadgeNode {
  return { type: 'badge', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    badge: BadgeNode;
  }
}
