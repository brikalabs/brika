import type { BaseNode } from './_shared';
import { normalizeChildren, type Child } from './_shared';
import type { ComponentNode } from './_shared';

export interface GridNode extends BaseNode {
  type: 'grid';
  columns?: number;
  children: ComponentNode[];
  gap?: 'sm' | 'md' | 'lg';
  /** Use auto-fit columns based on minColumnWidth */
  autoFit?: boolean;
  /** Minimum column width in px when autoFit is true (default: 120) */
  minColumnWidth?: number;
}

export function Grid(props: {
  columns?: number;
  gap?: 'sm' | 'md' | 'lg';
  autoFit?: boolean;
  minColumnWidth?: number;
  children?: Child | Child[];
}): GridNode {
  const { children, ...rest } = props;
  return { type: 'grid', ...rest, children: normalizeChildren(children) };
}

declare module './_shared' {
  interface NodeTypeMap {
    grid: GridNode;
  }
}
