import type { BaseNode } from './_shared';

export interface MarkdownNode extends BaseNode {
  type: 'markdown';
  content: string;
}

export function Markdown(props: Omit<MarkdownNode, 'type'>): MarkdownNode {
  return { type: 'markdown', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    markdown: MarkdownNode;
  }
}
