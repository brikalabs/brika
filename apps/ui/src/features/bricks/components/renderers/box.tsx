import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ComponentNodeRenderer, defineRenderer } from './registry';
import { resolveBackground } from './resolve-color';

const boxVariants = cva('relative flex min-h-0 flex-col overflow-clip', {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-1',
      md: 'p-2',
      lg: 'p-3',
    },
    rounded: {
      none: 'rounded-none',
      sm: 'rounded-md',
      md: 'rounded-xl',
      lg: 'rounded-2xl',
      full: 'rounded-full',
    },
    grow: {
      true: 'flex-1',
    },
  },
  defaultVariants: {
    padding: 'none',
    rounded: 'none',
  },
});

const blurOverlayVariants = cva('absolute inset-0 rounded-[inherit]', {
  variants: {
    blur: {
      sm: 'backdrop-blur-sm',
      md: 'backdrop-blur-md',
      lg: 'backdrop-blur-lg',
    },
  },
});

const bgFitVariants = cva('', {
  variants: {
    fit: {
      cover: 'bg-cover',
      contain: 'bg-contain',
      fill: 'bg-[length:100%_100%]',
    },
  },
  defaultVariants: {
    fit: 'cover',
  },
});

defineRenderer('box', ({ node, onAction }) => {
  const hasImage = !!node.backgroundImage;
  const bg = resolveBackground(node.background);

  const style: React.CSSProperties = {};

  if (hasImage) {
    style.backgroundImage = `url(${node.backgroundImage})`;
    style.backgroundPosition = node.backgroundPosition ?? 'center';
  }

  if (!hasImage && !node.blur && bg) {
    style.backgroundColor = bg;
  }

  const boxClass = boxVariants({
    padding: node.padding,
    rounded: node.rounded,
    grow: node.grow || undefined,
  });

  const fitClass = hasImage ? bgFitVariants({ fit: node.backgroundFit }) : '';
  const clickable = !!node.onPress;

  return (
    <div
      className={cn(boxClass, fitClass, clickable && 'cursor-pointer')}
      style={Object.keys(style).length > 0 ? style : undefined}
      onClick={clickable ? () => onAction?.(node.onPress as string) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {hasImage && bg && (
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ backgroundColor: bg, opacity: node.opacity ?? 0.5 }}
        />
      )}

      {node.blur && (
        <div
          className={blurOverlayVariants({ blur: node.blur })}
          style={!hasImage && bg ? { backgroundColor: bg } : undefined}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col only:*:min-h-0 only:*:flex-1">
        {node.children.map((child, i) => (
          <ComponentNodeRenderer key={`${child.type}-${i}`} node={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
});
