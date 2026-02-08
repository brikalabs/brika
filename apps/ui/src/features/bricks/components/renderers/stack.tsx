import type { StackNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { memo } from 'react';
import { type ActionHandler, ComponentNodeRenderer } from './registry';
import { gapVariant } from './shared';

const stackVariants = cva('flex min-h-0', {
  variants: {
    direction: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
    gap: gapVariant,
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
    },
    wrap: {
      true: 'flex-wrap',
    },
    grow: {
      true: 'flex-1',
    },
  },
  defaultVariants: {
    gap: 'md',
  },
});

export const StackRenderer = memo(function StackRenderer({
  node,
  onAction,
}: {
  node: StackNode;
  onAction?: ActionHandler;
}) {
  return (
    <div
      className={stackVariants({
        direction: node.direction,
        gap: node.gap,
        align: node.align,
        justify: node.justify,
        wrap: node.wrap || undefined,
        grow: node.grow || undefined,
      })}
    >
      {node.children.map((child, i) => (
        <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
