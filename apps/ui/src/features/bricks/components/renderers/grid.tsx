import type { GridNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { memo } from 'react';
import { type ActionHandler, ComponentNodeRenderer } from './registry';
import { gapVariant } from './shared';

const gridVariants = cva('grid min-h-0', {
  variants: {
    gap: gapVariant,
  },
  defaultVariants: {
    gap: 'md',
  },
});

export const GridRenderer = memo(function GridRenderer({
  node,
  onAction,
}: {
  node: GridNode;
  onAction?: ActionHandler;
}) {
  const gridStyle: React.CSSProperties = node.autoFit
    ? { gridTemplateColumns: `repeat(auto-fit, minmax(${node.minColumnWidth ?? 120}px, 1fr))` }
    : { gridTemplateColumns: `repeat(${node.columns ?? 2}, minmax(0, 1fr))` };

  return (
    <div
      className={gridVariants({ gap: node.gap })}
      style={gridStyle}
    >
      {node.children.map((child, i) => (
        <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
