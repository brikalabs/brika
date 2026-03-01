import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface BadgeNode extends BaseNode {
  type: 'badge';
  label: string;
  /** Semantic variant */
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
  /** Lucide icon name */
  icon?: string;
  /** Custom tint color (overrides variant) */
  color?: ColorValue;
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Badge(
  props: Omit<BadgeNode, 'type' | 'onPress'> & {
    onPress?: ActionHandler;
  }
): BadgeNode {
  const { onPress, ...rest } = props;
  return {
    type: 'badge',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    badge: BadgeNode;
  }
}
