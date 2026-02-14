import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface SectionNode extends BaseNode {
  type: 'section';
  title: string;
  children: ComponentNode[];
  /** Action dispatched when clicked */
  onPress?: string;
  /** Gap between children */
  gap?: 'sm' | 'md' | 'lg';
  /** Lucide icon name shown before the title */
  icon?: string;
}

export function Section(props: {
  title: string;
  onPress?: ActionHandler;
  gap?: 'sm' | 'md' | 'lg';
  icon?: string;
  children?: Child | Child[];
}): SectionNode {
  const { children, onPress, ...rest } = props;
  return {
    type: 'section',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
    children: normalizeChildren(children),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    section: SectionNode;
  }
}
