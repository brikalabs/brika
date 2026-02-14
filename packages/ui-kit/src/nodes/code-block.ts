import type { BaseNode } from './_shared';

export interface CodeBlockNode extends BaseNode {
  type: 'code-block';
  /** Code content */
  code: string;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Max visible lines before scroll */
  maxLines?: number;
  /** Show copy button */
  copyable?: boolean;
  /** Optional label/filename above the block */
  label?: string;
}

export function CodeBlock(props: Omit<CodeBlockNode, 'type'>): CodeBlockNode {
  return { type: 'code-block', ...props };
}

declare module './_shared' {
  interface NodeTypeMap {
    'code-block': CodeBlockNode;
  }
}
