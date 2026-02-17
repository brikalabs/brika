import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { isToken, resolveColor } from './resolve-color';
import { clickableProps } from './shared';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-0.5 @xs:gap-1 @md:gap-1.5 self-start rounded-md px-1 @xs:px-1.5 @md:px-2 py-0.5 font-semibold text-[9px] @xs:text-[10px] @md:text-xs',
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
  return (
    <span
      className={cn(
        node.color ? badgeVariants({ variant: null }) : badgeVariants({ variant: node.variant }),
        node.onPress && 'cursor-pointer'
      )}
      style={node.color ? getColorStyle(node.color) : undefined}
      {...clickableProps(node.onPress, onAction)}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className="size-2 @xs:size-2.5 @md:size-3.5 shrink-0" />}
      {node.label}
    </span>
  );
});
