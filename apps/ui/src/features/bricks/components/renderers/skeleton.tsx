import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('skeleton', ({ node }) => {
  if (node.variant === 'text' && (node.lines ?? 1) > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: node.lines ?? 1 }, (_, i) => (
          <Skeleton
            key={i}
            className={cn('h-4', i === (node.lines ?? 1) - 1 && 'w-3/4')}
            style={{ width: i < (node.lines ?? 1) - 1 ? node.width : undefined }}
          />
        ))}
      </div>
    );
  }

  return (
    <Skeleton
      className={cn(
        node.variant === 'circle' && 'rounded-full',
        node.variant === 'rect' && 'rounded-md'
      )}
      style={{
        width: node.width ?? (node.variant === 'circle' ? '2rem' : '100%'),
        height: node.height ?? (node.variant === 'circle' ? '2rem' : '1rem'),
      }}
    />
  );
});
