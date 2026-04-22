/**
 * EmptyState — unified empty / no-results placeholder.
 *
 * Icon sits inside a soft rounded pill, centered. Consistent padding
 * across all pages so "no plugins" and "no logs" feel like siblings.
 *
 * Usage:
 *   <EmptyState>
 *     <EmptyStateIcon><Package className="size-8" /></EmptyStateIcon>
 *     <EmptyStateTitle>No plugins</EmptyStateTitle>
 *     <EmptyStateDescription>Install one to get started.</EmptyStateDescription>
 *     <EmptyStateActions>
 *       <Button>Install</Button>
 *     </EmptyStateActions>
 *   </EmptyState>
 */

import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

function EmptyState({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center border-dashed px-6 py-16 text-center',
        className
      )}
      {...props}
    />
  );
}

function EmptyStateIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state-icon"
      className={cn(
        'mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground [&_svg:not([class*="size-"])]:size-8',
        className
      )}
      {...props}
    />
  );
}

function EmptyStateTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="empty-state-title"
      aria-label={
        props['aria-label'] ?? (typeof props.children === 'string' ? props.children : undefined)
      }
      className={cn('font-semibold text-base', className)}
      {...props}
    />
  );
}

function EmptyStateDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-state-description"
      className={cn('mt-1 max-w-sm text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function EmptyStateActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state-actions"
      className={cn('mt-5 flex items-center gap-2', className)}
      {...props}
    />
  );
}

export { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle };
