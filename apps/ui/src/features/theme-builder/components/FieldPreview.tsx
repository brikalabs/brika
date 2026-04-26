/**
 * FieldPreview — consistent wrapper for a field's live visualization.
 *
 * Used inside the controls panel under Geometry / Spacing / Effects /
 * Atmosphere fields to give each preview the same frame, label strip,
 * and optional caption slot. Fields inject whatever CSS custom property
 * they drive (e.g. `--spacing`, `--radius`) via the `style` prop so
 * children rendered with real UI components (Card, Button) scale to
 * the chosen value.
 */

import { cn } from '@brika/clay';
import type { CSSProperties, ReactNode } from 'react';

interface FieldPreviewProps {
  /** Short left-aligned label, e.g. "Live preview". */
  label?: ReactNode;
  /** Right-aligned monospace caption, e.g. "16px" or "0.75rem". */
  caption?: ReactNode;
  /** CSS custom properties to cascade to children. */
  style?: CSSProperties;
  className?: string;
  /** When true, stack children vertically with gap. Default: horizontal centered. */
  stacked?: boolean;
  children: ReactNode;
}

export function FieldPreview({
  label,
  caption,
  style,
  className,
  stacked,
  children,
}: Readonly<FieldPreviewProps>) {
  return (
    <div className={cn('overflow-hidden rounded-md border bg-muted/20', className)} style={style}>
      {(label || caption) && (
        <div className="flex items-center gap-2 border-b bg-card/60 px-safe-md py-1">
          {label && (
            <span className="font-medium text-[10px] text-foreground uppercase tracking-wider">
              {label}
            </span>
          )}
          {caption && (
            <span className="ml-auto font-mono text-[9px] text-muted-foreground tabular-nums">
              {caption}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'flex bg-card p-4',
          stacked ? 'flex-col items-stretch gap-3' : 'items-center justify-center'
        )}
      >
        {children}
      </div>
    </div>
  );
}
