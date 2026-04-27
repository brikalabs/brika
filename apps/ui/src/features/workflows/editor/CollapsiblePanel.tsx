/**
 * Collapsible Panel
 *
 * A generic panel component that can collapse to a minimal icon button.
 * Used for BlockToolbar, ConfigPanel, and DebugPanel in the workflow editor.
 *
 * When multiple panels on the same side are collapsed, they stack vertically
 * in a single container using CollapsedTabsContainer.
 */

import { cn } from '@brika/clay';
import { Button } from '@brika/clay/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay/components/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CollapsiblePanelProps {
  /** Which side of the screen the panel is on */
  side: 'left' | 'right';
  /** Icon to show when collapsed */
  icon: ReactNode;
  /** Title shown in tooltip when collapsed */
  title: string;
  /** Whether the panel is expanded */
  isOpen: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Width class when expanded (e.g., "w-56", "w-80") */
  width: string;
  /** Panel content */
  children: ReactNode;
  /** Additional className */
  className?: string;
}

export interface CollapsedTabProps {
  side: 'left' | 'right';
  icon: ReactNode;
  title: string;
  onExpand: () => void;
  /** Whether this is the first tab in a stack (adds top border) */
  isFirst?: boolean;
  className?: string;
}

export interface CollapsedTabsContainerProps {
  side: 'left' | 'right';
  children: ReactNode;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed Tabs Container
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Container for collapsed tabs on the same side.
 * Absolutely positioned to overlay on the canvas at the top.
 * Stacks tabs vertically and provides visual grouping.
 */
export function CollapsedTabsContainer({
  side,
  children,
  className,
}: Readonly<CollapsedTabsContainerProps>) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-4 z-10 flex flex-col gap-1',
        side === 'left' ? 'left-0 items-start' : 'right-0 items-end',
        className
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed Tab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single collapsed tab button.
 * Can be used inside CollapsedTabsContainer for stacking.
 */
export function CollapsedTab({
  side,
  icon,
  title,
  onExpand,
  className,
}: Readonly<CollapsedTabProps>) {
  const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'group pointer-events-auto flex h-auto flex-col gap-0.5 rounded-none bg-background/80 px-1.5 py-2 text-muted-foreground backdrop-blur-sm hover:bg-accent hover:text-foreground',
            side === 'left'
              ? 'rounded-r-lg border-t border-r border-b shadow-md'
              : 'rounded-l-lg border-t border-b border-l shadow-md',
            className
          )}
          onClick={onExpand}
          aria-label={`Expand ${title}`}
        >
          {icon}
          <ExpandIcon className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side === 'left' ? 'right' : 'left'}>
        <p>{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible Panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full collapsible panel component.
 * When collapsed, renders only a CollapsedTab.
 * For multiple collapsed panels on the same side, use the lower-level
 * CollapsedTab and CollapsedTabsContainer components directly.
 */
export function CollapsiblePanel({
  side,
  icon,
  title,
  isOpen,
  onToggle,
  width,
  children,
  className,
}: Readonly<CollapsiblePanelProps>) {
  // Collapsed state - return null (handled externally via CollapsedTabsContainer)
  if (!isOpen) {
    return null;
  }

  // Expanded state - show full panel with content
  return (
    <div
      className={cn(
        'h-full shrink-0 overflow-hidden transition-all duration-200',
        width,
        className
      )}
    >
      {children}
    </div>
  );
}
