import type { ComponentNode, GridNode } from '@brika/ui-kit';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { type ActionHandler, ComponentNodeRenderer } from './registry';
import { gapMap } from './shared';

export const GridRenderer = memo(function GridRenderer({
  node,
  onAction,
}: {
  node: GridNode;
  onAction?: ActionHandler;
}) {
  const children = node.children as ComponentNode[];
  const cols = node.columns ?? 2;

  return (
    <div
      className={cn('grid min-h-0 shrink-0', gapMap[node.gap ?? 'md'])}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children.map((child, i) => (
        <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
