import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '../../primitives/cn';

// Token-driven sizing for the default size. Themes override `--button-*` to
// retune. Per-size variants below replace the height/padding via
// tailwind-merge, so size="lg" still produces a fixed-pixel button.
// Consumers passing `className="px-2"` also win via tailwind-merge.
const buttonVariants = cva(
  "corner-button inline-flex shrink-0 items-center justify-center gap-[var(--button-gap)] whitespace-nowrap rounded-button font-[var(--button-font-weight)] text-sm outline-none transition-all focus-visible:ring-themed disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-button-filled-container text-button-filled-label hover:bg-button-filled-container/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline:
          'border border-button-outline-border bg-background text-button-outline-label shadow-surface hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-[var(--button-height)] px-[var(--button-padding-x)] py-[var(--button-padding-y)] has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-button px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-button px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-button px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-button [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        buttonVariants({
          variant,
          size,
          className,
        })
      )}
      {...props}
    />
  );
}

export { Button, buttonVariants };
