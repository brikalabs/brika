import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ComponentNodeRenderer, defineRenderer } from './registry';
import { clickableProps, gapVariant } from './shared';

const gridVariants = cva('grid min-h-0', {
  variants: {
    gap: gapVariant,
  },
  defaultVariants: {
    gap: 'md',
  },
});

defineRenderer('grid', ({ node, onAction }) => {
  const gridStyle: React.CSSProperties = node.autoFit
    ? { gridTemplateColumns: `repeat(auto-fit, minmax(${node.minColumnWidth ?? 120}px, 1fr))` }
    : { gridTemplateColumns: `repeat(${node.columns ?? 2}, minmax(0, 1fr))` };

  return (
    <div
      className={cn(gridVariants({ gap: node.gap }), node.onPress && 'cursor-pointer')}
      style={gridStyle}
      {...clickableProps(node.onPress, onAction)}
    >
      {node.children.map((child, i) => (
        <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
