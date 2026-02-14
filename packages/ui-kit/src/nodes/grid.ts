import {
  type ActionHandler,
  type BaseNode,
  type Child,
  type ComponentNode,
  normalizeChildren,
  resolveAction,
} from './_shared';

export interface GridNode extends BaseNode {
  type: 'grid';
  columns?: number;
  children: ComponentNode[];
  gap?: 'sm' | 'md' | 'lg';
  /** Use auto-fit columns based on minColumnWidth */
  autoFit?: boolean;
  /** Minimum column width in px when autoFit is true (default: 120) */
  minColumnWidth?: number;
  /** Action dispatched when clicked */
  onPress?: string;
}

export function Grid(props: {
  columns?: number;
  gap?: 'sm' | 'md' | 'lg';
  autoFit?: boolean;
  minColumnWidth?: number;
  onPress?: ActionHandler;
  children?: Child | Child[];
}): GridNode {
  const { children, onPress, ...rest } = props;
  return {
    type: 'grid',
    ...rest,
    onPress: onPress ? resolveAction(onPress) : undefined,
    children: normalizeChildren(children),
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    grid: GridNode;
  }
}
