import type { BaseNode } from './_shared';
import { normalizeChildren, type Child } from './_shared';
import type { ComponentNode } from './_shared';

export interface StackNode extends BaseNode {
  type: 'stack';
  direction: 'horizontal' | 'vertical';
  children: ComponentNode[];
  gap?: 'sm' | 'md' | 'lg';
  /** Cross-axis alignment */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Main-axis distribution */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  /** Allow wrapping */
  wrap?: boolean;
  /** Fill available space (flex-1) */
  grow?: boolean;
}

export function Stack(props: {
  direction: 'horizontal' | 'vertical';
  gap?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  grow?: boolean;
  children?: Child | Child[];
}): StackNode {
  const { children, ...rest } = props;
  return { type: 'stack', ...rest, children: normalizeChildren(children) };
}

declare module './_shared' {
  interface NodeTypeMap {
    stack: StackNode;
  }
}
