import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

const statusConfig: Record<string, { bg: string; pulse: boolean }> = {
  online: { bg: 'bg-emerald-500', pulse: true },
  offline: { bg: 'bg-muted-foreground', pulse: false },
  warning: { bg: 'bg-amber-500', pulse: true },
  error: { bg: 'bg-red-500', pulse: true },
  idle: { bg: 'bg-blue-500', pulse: false },
};

defineRenderer('status', ({ node }) => {
  const config = statusConfig[node.status] ?? { bg: 'bg-muted-foreground', pulse: false };

  return (
    <div className="flex shrink-0 items-center gap-2 @md:gap-2.5 rounded-md bg-muted/40 px-2.5 @md:px-3 py-2 @md:py-2.5">
      {node.icon && (
        <DynamicIcon
          name={node.icon as IconName}
          className="size-3.5 @md:size-4 shrink-0 text-muted-foreground"
        />
      )}
      <span className="flex-1 truncate font-medium text-xs @md:text-sm">{node.label}</span>
      <span
        className={cn('size-2 @md:size-2.5 shrink-0 rounded-full', config.bg, config.pulse && 'animate-pulse')}
      />
      <span className="text-[11px] @md:text-xs text-muted-foreground capitalize">{node.status}</span>
    </div>
  );
});
