import type { StatValueNode } from '@brika/ui-kit';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';

export const StatValueRenderer = memo(function StatValueRenderer({
  node,
}: {
  node: StatValueNode;
}) {
  return (
    <div className="flex shrink-0 flex-col justify-center rounded-md bg-muted/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {node.icon && (
          <DynamicIcon
            name={node.icon as IconName}
            className="size-3.5 shrink-0"
            style={{ color: node.color ?? undefined }}
          />
        )}
        <span className="truncate text-[11px] text-muted-foreground">{node.label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-base tabular-nums leading-tight">
          {typeof node.value === 'number' ? node.value.toLocaleString() : node.value}
        </span>
        {node.unit && <span className="text-[11px] text-muted-foreground">{node.unit}</span>}
        {node.trend &&
          node.trend !== 'flat' &&
          (node.trend === 'up' ? (
            <ArrowUp className="size-3 text-emerald-500" />
          ) : (
            <ArrowDown className="size-3 text-red-500" />
          ))}
      </div>
    </div>
  );
});
