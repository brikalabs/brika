import type { BaseNode } from './_shared';
import { normalizeChildren, type Child } from './_shared';
import type { ComponentNode } from './_shared';

export interface SectionNode extends BaseNode {
  type: 'section';
  title: string;
  children: ComponentNode[];
}

export function Section(props: { title: string; children?: Child | Child[] }): SectionNode {
  const { children, ...rest } = props;
  return { type: 'section', ...rest, children: normalizeChildren(children) };
}

declare module './_shared' {
  interface NodeTypeMap {
    section: SectionNode;
  }
}
