import type { SectionNode } from '@brika/ui-kit';
import { memo } from 'react';
import { type ActionHandler, ComponentNodeRenderer } from './registry';

export const SectionRenderer = memo(function SectionRenderer({
  node,
  onAction,
}: {
  node: SectionNode;
  onAction?: ActionHandler;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        <h4 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {node.title}
        </h4>
        <div className="h-px flex-1 bg-border/50" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {node.children.map((child, i) => (
          <ComponentNodeRenderer key={i} node={child} onAction={onAction} />
        ))}
      </div>
    </div>
  );
});
