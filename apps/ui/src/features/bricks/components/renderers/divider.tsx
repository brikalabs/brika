import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('divider', ({ node }) => {
  const isVertical = node.direction === 'vertical';
  const lineStyle = node.color ? { backgroundColor: node.color } : undefined;

  if (node.label && !isVertical) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <div className={cn('h-px flex-1', !node.color && 'bg-border/50')} style={lineStyle} />
        <span className="text-[10px] text-muted-foreground">{node.label}</span>
        <div className={cn('h-px flex-1', !node.color && 'bg-border/50')} style={lineStyle} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'shrink-0',
        isVertical ? 'h-full w-px' : 'h-px w-full',
        !node.color && 'bg-border/50'
      )}
      style={lineStyle}
    />
  );
});
