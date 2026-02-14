import { cva } from 'class-variance-authority';
import { defineRenderer } from './registry';
import { resolveColor } from './resolve-color';

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
  const clickable = !!node.onPress;

  const style: React.CSSProperties = {};
  const resolved = resolveColor(node.color);
  if (resolved) style.color = resolved;
  if (node.maxLines) {
    style.display = '-webkit-box';
    style.WebkitLineClamp = node.maxLines;
    style.WebkitBoxOrient = 'vertical';
    style.overflow = 'hidden';
  }

  return (
    <p
      className={`${textVariants({
        variant: node.variant,
        align: node.align,
        weight: node.weight,
        size: node.size,
        truncate: node.truncate || undefined,
      })}${clickable ? 'cursor-pointer' : ''}`}
      style={Object.keys(style).length > 0 ? style : undefined}
      onClick={clickable ? () => onAction?.(node.onPress as string) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {node.content}
    </p>
  );
});
