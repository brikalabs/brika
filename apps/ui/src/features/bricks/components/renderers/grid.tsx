import { cva } from 'class-variance-authority';
import { ComponentNodeRenderer, defineRenderer } from './registry';
import { gapVariant } from './shared';

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

  const clickable = !!node.onPress;

  return (
    <div
      className={`${gridVariants({ gap: node.gap })}${clickable ? 'cursor-pointer' : ''}`}
      style={gridStyle}
      onClick={clickable ? () => onAction?.(node.onPress as string) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {node.children.map((child, i) => (
        <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
      ))}
    </div>
  );
});
