import type { ComponentNode, StackNode } from '@brika/ui-kit';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { type ActionHandler, ComponentNodeRenderer } from './registry';
import { gapMap } from './shared';

export const StackRenderer = memo(function StackRenderer({
  node,
  onAction,
}: {
  node: StackNode;
  onAction?: ActionHandler;
}) {
  const children = node.children as ComponentNode[];

  return (
    <div
      className={cn(
        'flex min-h-0 shrink-0',
        node.direction === 'vertical' ? 'flex-col' : 'flex-row',
        gapMap[node.gap ?? 'md']
      )}
    >
      {children.map((child, i) => (
        <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
