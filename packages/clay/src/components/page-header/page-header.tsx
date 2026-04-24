/**
 * PageHeader — unified page-level heading.
 *
 * Composable primitives following the shadcn pattern.
 *
 * Usage:
 *   <PageHeader>
 *     <PageHeaderInfo>
 *       <PageHeaderTitle>Workflows</PageHeaderTitle>
 *       <PageHeaderDescription>
 *         Manage your automations
 *         <PageHeaderCount value={12} />
 *       </PageHeaderDescription>
 *     </PageHeaderInfo>
 *     <PageHeaderActions>
 *       <Button>New</Button>
 *     </PageHeaderActions>
 *   </PageHeader>
 */

import type * as React from 'react';
import { cn } from '../../primitives/cn';

function PageHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header"
      className={cn('flex items-start justify-between gap-4', className)}
      {...props}
    />
  );
}

function PageHeaderInfo({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="page-header-info" className={cn('min-w-0', className)} {...props} />;
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn('truncate font-semibold text-2xl tracking-tight', className)}
      {...props}
    />
  );
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-header-description"
      className={cn('mt-1 text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function PageHeaderCount({
  value,
  className,
  ...props
}: { value: number | string } & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="page-header-count"
      className={cn('ml-2 font-medium tabular-nums', className)}
      {...props}
    >
      · {value}
    </span>
  );
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn('flex shrink-0 items-center gap-2', className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderActions,
  PageHeaderCount,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
};
