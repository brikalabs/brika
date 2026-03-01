import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface IconNode extends BaseNode {
  type: 'icon';
  /** Lucide icon name */
  name: string;
  /** Display size */
  size?: 'sm' | 'md' | 'lg';
  /** Icon color */
  color?: ColorValue;
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Icon(
  props: Omit<IconNode, 'type' | 'onPress'> & {
    onPress?: ActionHandler;
  }
): IconNode {
  const { onPress, ...rest } = props;
  return {
    type: 'icon',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    icon: IconNode;
  }
}
