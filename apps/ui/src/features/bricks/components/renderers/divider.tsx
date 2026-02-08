import type { DividerNode } from '@brika/ui-kit';
import { memo } from 'react';
import { cn } from '@/lib/utils';

export const DividerRenderer = memo(function DividerRenderer({ node }: { node: DividerNode }) {
  const isVertical = node.direction === 'vertical';

  return (
    <div
      className={cn(
        'shrink-0',
        isVertical ? 'h-full w-px' : 'h-px w-full',
        !node.color && 'bg-border/50',
      )}
      style={node.color ? { backgroundColor: node.color } : undefined}
    />
  );
});
