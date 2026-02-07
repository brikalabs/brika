import type { BaseNode } from './_shared';
import { normalizeChildren, type Child } from './_shared';
import type { ComponentNode } from './_shared';

export interface StackNode extends BaseNode {
  type: 'stack';
  direction: 'horizontal' | 'vertical';
  children: ComponentNode[];
  gap?: 'sm' | 'md' | 'lg';
}

export function Stack(props: { direction: 'horizontal' | 'vertical'; gap?: 'sm' | 'md' | 'lg'; children?: Child | Child[] }): StackNode {
  const { children, ...rest } = props;
  return { type: 'stack', ...rest, children: normalizeChildren(children) };
}

declare module './_shared' {
  interface NodeTypeMap {
    stack: StackNode;
  }
}
