import { type ActionHandler, type BaseNode, resolveAction } from './_shared';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
}

export interface TableNode extends BaseNode {
  type: 'table';
  columns: TableColumn[];
  rows: Record<string, string | number>[];
  /** Show zebra-striped rows */
  striped?: boolean;
  /** Compact row height */
  compact?: boolean;
  /** Max visible rows before scrolling */
  maxRows?: number;
  /** Action dispatched when a row is clicked */
  onRowPress?: string;
}

export function Table(
  props: Omit<TableNode, 'type' | 'onRowPress'> & {
    onRowPress?: ActionHandler;
  }
): TableNode {
  const { onRowPress, ...rest } = props;
  return {
    type: 'table',
    ...rest,
    onRowPress: onRowPress ? resolveAction(onRowPress) : undefined,
  };
}

declare module './_shared' {
  interface NodeTypeMap {
    table: TableNode;
  }
}
