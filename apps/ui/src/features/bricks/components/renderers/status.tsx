import type { StatusNode } from '@brika/ui-kit';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { bg: string; pulse: boolean }> = {
  online: { bg: 'bg-emerald-500', pulse: true },
  offline: { bg: 'bg-muted-foreground', pulse: false },
  warning: { bg: 'bg-amber-500', pulse: true },
  error: { bg: 'bg-red-500', pulse: true },
  idle: { bg: 'bg-blue-500', pulse: false },
};

export const StatusRenderer = memo(function StatusRenderer({ node }: { node: StatusNode }) {
  const config = statusConfig[node.status] ?? { bg: 'bg-muted-foreground', pulse: false };

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2">
      {node.icon && (
        <DynamicIcon
          name={node.icon as IconName}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <span className="flex-1 truncate font-medium text-xs">{node.label}</span>
      <span
        className={cn('size-2 shrink-0 rounded-full', config.bg, config.pulse && 'animate-pulse')}
      />
      <span className="text-[11px] text-muted-foreground capitalize">{node.status}</span>
    </div>
  );
});
