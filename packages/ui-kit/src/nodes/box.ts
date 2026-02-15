import type { BackgroundValue } from '../colors';
import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface BoxNode extends BaseNode {
  type: 'box';
  children: ComponentNode[];

  /** CSS color, gradient, or theme token (e.g. "#ff6b35", "muted", "card") */
  background?: BackgroundValue;
  /** Background image URL */
  backgroundImage?: string;
  /** How the background image fits */
  backgroundFit?: 'cover' | 'contain' | 'fill';
  /** Background image anchor position */
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  /** Backdrop blur level (glassmorphism) */
  blur?: 'sm' | 'md' | 'lg';
  /** Background layer opacity (0-1), useful with backgroundImage + background overlay */
  opacity?: number;
  /** Inner padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** Fill available space (flex-1) */
  grow?: boolean;
  /** Explicit width — CSS value like "50%", "200px" */
  width?: string;
  /** Explicit height — CSS value like "50%", "100px" */
  height?: string;
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Box(props: {
  background?: BackgroundValue;
  backgroundImage?: string;
  backgroundFit?: 'cover' | 'contain' | 'fill';
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  blur?: 'sm' | 'md' | 'lg';
  opacity?: number;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  grow?: boolean;
  width?: string;
  height?: string;
  onPress?: ActionHandler;
  children?: Child | Child[];
}): BoxNode {
  const { children, onPress, ...rest } = props;
  return {
    type: 'box',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
    children: normalizeChildren(children),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    box: BoxNode;
  }
}
