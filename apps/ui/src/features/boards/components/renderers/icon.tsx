import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

const iconVariants = cva('shrink-0', {
  variants: {
    size: {
      sm: 'size-3 @xs:size-3.5',
      md: 'size-4 @xs:size-5',
      lg: 'size-5 @xs:size-7',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

defineRenderer('icon', ({ node, onAction }) => {
  const clickable = !!node.onPress;

  if (clickable) {
    return (
      <button
        type="button"
        className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-0.5 hover:bg-muted/50"
        onClick={() => onAction?.(node.onPress as string)}
      >
        <DynamicIcon
          name={node.name as IconName}
          className={iconVariants({ size: node.size })}
          style={node.color ? { color: resolveColor(node.color) } : undefined}
        />
      </button>
    );
  }

  return (
    <DynamicIcon
      name={node.name as IconName}
      className={iconVariants({ size: node.size })}
      style={node.color ? { color: resolveColor(node.color) } : undefined}
    />
  );
});
