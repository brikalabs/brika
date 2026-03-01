import type { ColumnNode, RowNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { type ActionHandler, ComponentNodeRenderer, defineRenderer } from './registry';
import { clickableProps, gapVariant } from './shared';

const flexVariants = cva('flex min-h-0 min-w-0', {
  variants: {
    direction: {
      row: 'flex-row',
      column: 'flex-col',
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

function FlexRenderer({
  node,
  onAction,
}: Readonly<{
  node: RowNode | ColumnNode;
  onAction?: ActionHandler;
}>) {
  const direction = node.type === 'row' ? 'row' : 'column';

  const dimStyle: React.CSSProperties | undefined =
    node.width || node.height
      ? {
          ...(node.width
            ? {
                width: node.width,
                flexShrink: 0,
              }
            : undefined),
          ...(node.height
            ? {
                height: node.height,
              }
            : undefined),
        }
      : undefined;

  return (
    <div
      className={cn(
        flexVariants({
          direction,
          gap: node.gap,
          align: node.align,
          justify: node.justify,
          wrap: node.wrap || undefined,
          grow: node.grow || undefined,
        }),
        node.onPress && 'cursor-pointer'
      )}
      style={dimStyle}
      {...clickableProps(node.onPress, onAction)}
    >
      {node.children.map((child, i) => (
        <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
      ))}
    </div>
  );
}

defineRenderer('row', FlexRenderer);
defineRenderer('column', FlexRenderer);
