import { type ActionHandler, type BaseNode, resolveAction } from './_shared';

export interface AvatarNode extends BaseNode {
  type: 'avatar';
  /** Image URL */
  src?: string;
  /** Fallback text (typically initials, e.g. "MS") */
  fallback?: string;
  /** Lucide icon name shown inside the avatar (overrides fallback text) */
  icon?: string;
  /** Background color for icon/fallback mode */
  color?: string;
  /** Accessible label */
  alt?: string;
  /** Display size */
  size?: 'sm' | 'md' | 'lg';
  /** Shape */
  shape?: 'circle' | 'square';
  /** Status indicator */
  status?: 'online' | 'offline' | 'busy' | 'away';
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Avatar(
  props: Omit<AvatarNode, 'type' | 'onPress'> & {
    onPress?: ActionHandler;
  }
): AvatarNode {
  const { onPress, ...rest } = props;
  return {
    type: 'avatar',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    avatar: AvatarNode;
  }
}
