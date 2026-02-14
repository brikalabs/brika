import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  type FlexLayoutProps,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface ColumnNode extends BaseNode, FlexLayoutProps {
  type: 'column';
  children: ComponentNode[];
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Column(
  props: FlexLayoutProps & {
    onPress?: ActionHandler;
    children?: Child | Child[];
  }
): ColumnNode {
  const { children, onPress, ...rest } = props;
  return {
    type: 'column',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
    children: normalizeChildren(children),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    column: ColumnNode;
  }
}
