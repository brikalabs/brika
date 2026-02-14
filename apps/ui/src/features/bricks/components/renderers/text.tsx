import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';
import { clickableProps } from './shared';

const textVariants = cva('shrink-0', {
  variants: {
    variant: {
      heading: 'font-semibold text-sm',
      caption: 'text-[11px] text-muted-foreground',
      body: 'text-xs',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    size: {
      xs: '!text-[11px]',
      sm: '!text-xs',
      md: '!text-sm',
      lg: '!text-base',
      xl: '!text-lg',
    },
    truncate: {
      true: 'truncate',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

defineRenderer('text', ({ node, onAction }) => {
  const resolved = resolveColor(node.color);
  const lineClampStyle: Record<string, unknown> = node.maxLines
    ? { display: '-webkit-box', WebkitLineClamp: node.maxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : {};
  const style: React.CSSProperties = {
    ...(resolved ? { color: resolved } : undefined),
    ...lineClampStyle,
  };

  return (
    <p
      className={cn(
        textVariants({
          variant: node.variant,
          align: node.align,
          weight: node.weight,
          size: node.size,
          truncate: node.truncate || undefined,
        }),
        node.onPress && 'cursor-pointer'
      )}
      style={Object.keys(style).length > 0 ? style : undefined}
      {...clickableProps(node.onPress, onAction)}
    >
      {node.content}
    </p>
  );
});
