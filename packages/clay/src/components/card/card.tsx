import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../../primitives/cn';

const cardVariants = cva(
  'relative rounded-xl border bg-card text-card-foreground shadow-sm transition-color duration-200',
  {
    variants: {
      accent: {
        none: 'border-border',
        blue: 'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-1),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-1),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-1),transparent_70%)] [--accent:var(--data-1)]',
        emerald:
          'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-3),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-3),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-3),transparent_70%)] [--accent:var(--data-3)]',
        violet:
          'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-5),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-5),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-5),transparent_70%)] [--accent:var(--data-5)]',
        orange:
          'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-2),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-2),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-2),transparent_70%)] [--accent:var(--data-2)]',
        purple:
          'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-5),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-5),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-5),transparent_70%)] [--accent:var(--data-5)]',
        amber:
          'border-transparent [--accent-bg-hover:color-mix(in_oklch,var(--data-6),transparent_90%)] [--accent-bg:color-mix(in_oklch,var(--data-6),transparent_95%)] [--accent-border:color-mix(in_oklch,var(--data-6),transparent_70%)] [--accent:var(--data-6)]',
      },
      interactive: {
        true: 'group cursor-pointer',
        false: '',
      },
    },
    compoundVariants: [
      {
        accent: 'none',
        interactive: true,
        className: 'border-foreground/10 hover:border-foreground/20 hover:shadow-md',
      },
      {
        accent: ['blue', 'emerald', 'violet', 'orange', 'purple', 'amber'],
        className: 'border-[var(--accent-border)]',
      },
      {
        accent: ['blue', 'emerald', 'violet', 'orange', 'purple', 'amber'],
        interactive: true,
        className: 'hover:border-[var(--accent-border)] hover:shadow-lg',
      },
    ],
    defaultVariants: {
      accent: 'none',
      interactive: false,
    },
  }
);

interface CardProps extends React.ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

function Card({ className, accent, interactive, children, ...props }: Readonly<CardProps>) {
  const hasAccent = accent && accent !== 'none';

  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({
          accent,
          interactive,
        }),
        className
      )}
      {...props}
    >
      {hasAccent && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 rounded-xl bg-(--accent-bg) transition-colors',
            interactive && 'group-hover:bg-(--accent-bg-hover)'
          )}
        />
      )}
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-6', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      aria-label={
        props['aria-label'] ?? (typeof props.children === 'string' ? props.children : undefined)
      }
      className={cn('font-semibold text-lg leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-6 pt-0', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  );
}

export type { CardProps };
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
