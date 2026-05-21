/**
 * SectionLabel — small uppercase group header for in-page partitions.
 *
 * Typically used above a sub-group of cards, e.g. "2 errors" or
 * "3 needs attention" preceding the card list. Uses semantic tokens
 * only — no hardcoded colors.
 *
 * Usage:
 *   <SectionLabel tone="destructive" icon={AlertTriangle}>
 *     2 errors
 *   </SectionLabel>
 */

import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const sectionLabelIconVariants = cva('size-3.5', {
  variants: {
    tone: {
      default: 'text-muted-foreground',
      warning: 'text-warning',
      destructive: 'text-destructive',
      success: 'text-success',
      info: 'text-info',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

interface SectionLabelProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof sectionLabelIconVariants> {
  icon?: LucideIcon;
}

function SectionLabel({ className, tone, icon: Icon, children, ...props }: SectionLabelProps) {
  return (
    <div
      data-slot="section-label"
      className={cn('flex items-center gap-1.5 text-muted-foreground text-xs', className)}
      {...props}
    >
      {Icon && <Icon className={sectionLabelIconVariants({ tone })} />}
      <span className="font-medium uppercase tracking-wider">{children}</span>
    </div>
  );
}

export { SectionLabel };
