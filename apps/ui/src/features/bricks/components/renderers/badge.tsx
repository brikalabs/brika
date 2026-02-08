import type { BadgeNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
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
  },
);

export const BadgeRenderer = memo(function BadgeRenderer({ node }: { node: BadgeNode }) {
  return (
    <span
      className={node.color ? badgeVariants({ variant: null }) : badgeVariants({ variant: node.variant })}
      style={node.color ? { backgroundColor: `${node.color}20`, color: node.color } : undefined}
    >
      {node.icon && <DynamicIcon name={node.icon as IconName} className="size-2.5 shrink-0" />}
      {node.label}
    </span>
  );
});
