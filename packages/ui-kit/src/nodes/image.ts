import type { BaseNode } from './_shared';

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
}

export function Image(props: Omit<ImageNode, 'type'>): ImageNode {
  return { type: 'image', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    image: ImageNode;
  }
}
