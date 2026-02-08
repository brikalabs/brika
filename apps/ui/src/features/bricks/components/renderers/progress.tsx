import type { ProgressNode } from '@brika/ui-kit';
import { memo } from 'react';

export const ProgressRenderer = memo(function ProgressRenderer({ node }: { node: ProgressNode }) {
  const pct = Math.max(0, Math.min(100, node.value));

  return (
    <div className="shrink-0 space-y-1">
      {(node.label || node.showValue) && (
        <div className="flex items-center justify-between gap-2">
          {node.label && (
            <span className="truncate text-[11px] text-muted-foreground">{node.label}</span>
          )}
          {node.showValue && (
            <span className="text-[11px] font-medium tabular-nums">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: node.color ?? 'var(--color-primary)',
          }}
        />
      </div>
    </div>
  );
});
