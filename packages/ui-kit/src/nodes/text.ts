import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode } from './_shared';
import { resolveAction } from './_shared';

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  variant?: 'body' | 'caption' | 'heading';
  color?: ColorValue;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Font weight override */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  /** Truncate with ellipsis (single line) */
  truncate?: boolean;
  /** Max visible lines before clamping */
  maxLines?: number;
  /** Font size override */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Text(
  props: Omit<TextNode, 'type' | 'onPress'> & { onPress?: ActionHandler }
): TextNode {
  const { onPress, ...rest } = props;
  return { type: 'text', ...rest, onPress: onPress ? resolveAction(onPress) : undefined };
}

declare module './_shared' {
  interface NodeTypeMap {
    text: TextNode;
  }
}
