/**
 * PageToolbar — a horizontal row of filters, search, status badges.
 *
 * Replaces the ad-hoc `<Card><CardContent pt-4>` wrappers that were
 * used around filter bars. No Card — this is a bare, semantic row.
 *
 * Usage:
 *   <PageToolbar>
 *     <PageToolbarGroup>
 *       <SearchInput />
 *     </PageToolbarGroup>
 *     <PageToolbarGroup>
 *       <LevelFilter />
 *       <SourceFilter />
 *     </PageToolbarGroup>
 *   </PageToolbar>
 */

import type * as React from 'react';
import { cn } from '@/lib/utils';

function PageToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm',
        className
      )}
      {...props}
    />
  );
}

function PageToolbarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-toolbar-group"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export { PageToolbar, PageToolbarGroup };
