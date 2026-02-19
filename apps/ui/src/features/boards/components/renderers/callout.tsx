import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

const variantConfig = {
  info: {
    icon: 'info',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
  warning: {
    icon: 'triangle-alert',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
  },
  error: {
    icon: 'circle-x',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  success: {
    icon: 'circle-check',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
} as const;

defineRenderer('callout', ({ node }) => {
  const cfg = variantConfig[node.variant];
  const iconName = (node.icon ?? cfg.icon) as IconName;

  return (
    <div
      className={cn(
        'flex shrink-0 items-start @md:gap-3 gap-2 rounded-md border @md:px-3.5 px-2.5 @md:py-2.5 py-2',
        cfg.bg,
        cfg.border
      )}
    >
      <DynamicIcon
        name={iconName}
        className={cn('mt-0.5 @md:size-4 size-3.5 shrink-0', cfg.text)}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        {node.title && <p className="font-medium @md:text-sm text-xs">{node.title}</p>}
        <p className="@md:text-sm text-muted-foreground text-xs">{node.message}</p>
      </div>
    </div>
  );
});
