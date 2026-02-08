import type { BoxNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { memo } from 'react';
import { type ActionHandler, ComponentNodeRenderer } from './registry';

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

export const BoxRenderer = memo(function BoxRenderer({
  node,
  onAction,
}: {
  node: BoxNode;
  onAction?: ActionHandler;
}) {
  const hasImage = !!node.backgroundImage;

  // Build inline style: background-image natively clips to border-radius.
  const style: React.CSSProperties = {};

  if (hasImage) {
    style.backgroundImage = `url(${node.backgroundImage})`;
    style.backgroundPosition = node.backgroundPosition ?? 'center';
  }

  if (!hasImage && !node.blur && node.background) {
    style.backgroundColor = node.background;
  }

  const boxClass = boxVariants({
    padding: node.padding,
    rounded: node.rounded,
    grow: node.grow || undefined,
  });

  const fitClass = hasImage ? bgFitVariants({ fit: node.backgroundFit }) : '';

  return (
    <div
      className={fitClass ? `${boxClass} ${fitClass}` : boxClass}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {/* Tint overlay on background images */}
      {hasImage && node.background && (
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            backgroundColor: node.background,
            opacity: node.opacity ?? 0.5,
          }}
        />
      )}

      {/* Blur layer: separate div so children stay crisp */}
      {node.blur && (
        <div
          className={blurOverlayVariants({ blur: node.blur })}
          style={!hasImage && node.background ? { backgroundColor: node.background } : undefined}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col only:*:min-h-0 only:*:flex-1">
        {node.children.map((child, i) => (
          <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
});
