import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { defineRenderer } from './registry';
import { isToken, resolveColor } from './resolve-color';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 self-start rounded-md px-1.5 py-0.5 font-semibold text-[10px]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border bg-transparent text-foreground',
        success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function getColorStyle(color: string): React.CSSProperties {
  const resolved = resolveColor(color);
  if (isToken(color)) {
    // Token: use color-mix for semi-transparent bg (can't append hex alpha to var())
    return {
      backgroundColor: `color-mix(in oklch, ${resolved} 12%, transparent)`,
      color: resolved as string,
    };
  }
  // Literal CSS color: existing hex-alpha approach
  return { backgroundColor: `${color}20`, color };
}

defineRenderer('badge', ({ node, onAction }) => {
  const clickable = !!node.onPress;

  return (
    <span
      className={`${node.color ? badgeVariants({ variant: null }) : badgeVariants({ variant: node.variant })}${clickable ? 'cursor-pointer' : ''}`}
      style={node.color ? getColorStyle(node.color) : undefined}
      onClick={clickable ? () => onAction?.(node.onPress as string) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className="size-2.5 shrink-0" />}
      {node.label}
    </span>
  );
});
