import type { BaseNode } from './_shared';

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill';
  rounded?: boolean;
  aspectRatio?: string;
  caption?: string;
}

export function Image(props: Omit<ImageNode, 'type'>): ImageNode {
  return { type: 'image', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    image: ImageNode;
  }
}
