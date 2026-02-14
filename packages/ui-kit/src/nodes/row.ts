import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  type FlexLayoutProps,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface RowNode extends BaseNode, FlexLayoutProps {
  type: 'row';
  children: ComponentNode[];
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Row(
  props: FlexLayoutProps & {
    onPress?: ActionHandler;
    children?: Child | Child[];
  }
): RowNode {
  const { children, onPress, ...rest } = props;
  return {
    type: 'row',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
    children: normalizeChildren(children),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    row: RowNode;
  }
}
