import { cva } from 'class-variance-authority';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { clickableProps } from './shared';

const sizeVariants = cva('', {
  variants: {
    size: {
      sm: 'size-6',
      md: 'size-8',
      lg: 'size-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const statusColors = {
  online: 'bg-emerald-500',
  offline: 'bg-muted-foreground',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
} as const;

defineRenderer('avatar', ({ node, onAction }) => {
  return (
    <div
      className={cn('relative inline-flex shrink-0', node.onPress && 'cursor-pointer')}
      {...clickableProps(node.onPress, onAction)}
    >
      <Avatar
        className={cn(sizeVariants({ size: node.size }), node.shape === 'square' && 'rounded-md')}
      >
        {node.src && <AvatarImage src={node.src} alt={node.alt ?? ''} />}
        <AvatarFallback className={node.shape === 'square' ? 'rounded-md' : undefined}>
          {node.fallback ?? '?'}
        </AvatarFallback>
      </Avatar>
      {node.status && (
        <span
          className={cn(
            'absolute right-0 bottom-0 block rounded-full ring-2 ring-background',
            node.size === 'lg' ? 'size-3' : 'size-2',
            statusColors[node.status]
          )}
        />
      )}
    </div>
  );
});
