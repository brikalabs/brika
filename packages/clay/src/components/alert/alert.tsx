import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../primitives/cn';

const alertVariants = cva(
  'corner-themed relative flex w-full items-start gap-3 rounded-alert border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        destructive: 'border-destructive/30 bg-destructive/10 text-foreground',
        info: 'border-[color-mix(in_oklch,var(--data-1),transparent_70%)] bg-[color-mix(in_oklch,var(--data-1),transparent_92%)] text-foreground [--alert-accent:var(--data-1)]',
        warning:
          'border-[color-mix(in_oklch,var(--data-2),transparent_70%)] bg-[color-mix(in_oklch,var(--data-2),transparent_92%)] text-foreground [--alert-accent:var(--data-2)]',
        success:
          'border-[color-mix(in_oklch,var(--data-3),transparent_70%)] bg-[color-mix(in_oklch,var(--data-3),transparent_92%)] text-foreground [--alert-accent:var(--data-3)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface AlertProps extends React.ComponentProps<'div'>, VariantProps<typeof alertVariants> {
  /** Visual treatment: `default` (quiet), `destructive` (error tint), `info` / `warning` / `success` (semantic data colors). */
  variant?: VariantProps<typeof alertVariants>['variant'];
  /** Additional Tailwind / utility classes merged on top of the variant classes. */
  className?: string;
}

/**
 * Banner-style callout for messages, errors, and notices. Composes with
 * `AlertTitle`, `AlertDescription`, and optional `AlertIcon` slots. The
 * root carries `role="alert"` so assistive tech announces it on mount.
 */
function Alert({ className, variant = 'default', ...props }: Readonly<AlertProps>) {
  return (
    <div
      role="alert"
      data-slot="alert"
      data-variant={variant}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

interface AlertTitleProps extends React.ComponentProps<'div'> {
  /** Additional classes merged onto the title row. */
  className?: string;
}

/**
 * Headline row for an `Alert`. Rendered as a `<div>` styled like an h5,
 * with a stronger color when used inside a `destructive` alert.
 */
function AlertTitle({ className, ...props }: Readonly<AlertTitleProps>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
        'group-data-[variant=destructive]/alert:text-destructive',
        className
      )}
      {...props}
    />
  );
}

interface AlertDescriptionProps extends React.ComponentProps<'div'> {
  /** Additional classes merged onto the description block. */
  className?: string;
}

/**
 * Body copy for an `Alert`. Uses muted-foreground by default so the title
 * stays the visual anchor.
 */
function AlertDescription({ className, ...props }: Readonly<AlertDescriptionProps>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_p]:leading-relaxed',
        className
      )}
      {...props}
    />
  );
}

interface AlertIconProps extends React.ComponentProps<'div'> {
  /** Additional classes merged onto the icon slot. */
  className?: string;
}

/**
 * Optional icon slot, laid out at the start of the alert row. Pass any
 * SVG or lucide icon as the child; size defaults to 1rem square.
 */
function AlertIcon({ className, ...props }: Readonly<AlertIconProps>) {
  return (
    <div
      data-slot="alert-icon"
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center [&>svg]:size-4 [&>svg]:shrink-0',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertIcon, AlertTitle, alertVariants };
