import { type ActionHandler, type BaseNode, resolveAction } from './_shared';

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  alt?: string;
  /** px number or CSS string like "30%" */
  width?: number | string;
  height?: number | string;
  fit?: 'cover' | 'contain' | 'fill';
  rounded?: boolean;
  aspectRatio?: string;
  caption?: string;
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Image(
  props: Omit<ImageNode, 'type' | 'onPress'> & { onPress?: ActionHandler }
): ImageNode {
  const { onPress, ...rest } = props;
  return { type: 'image', ...rest, onPress: onPress ? resolveAction(onPress) : undefined };
}

declare module './_shared' {
  interface NodeTypeMap {
    image: ImageNode;
  }
}
