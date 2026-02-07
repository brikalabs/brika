import type { BaseNode } from './_shared';

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  variant?: 'body' | 'caption' | 'heading';
  color?: string;
}

export function Text(props: Omit<TextNode, 'type'>): TextNode {
  return { type: 'text', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    text: TextNode;
  }
}
