import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { clickableProps } from './shared';

const sizeVariants = cva('', {
  variants: {
    size: {
      sm: 'size-5 @xs:size-6',
      md: 'size-6 @xs:size-8',
      lg: 'size-10 @xs:size-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const iconSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'size-2.5 @xs:size-3',
      md: 'size-3 @xs:size-4',
      lg: 'size-5 @xs:size-6',
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
        <AvatarFallback
          className={cn(node.shape === 'square' ? 'rounded-md' : undefined)}
          style={node.color ? { background: node.color } : undefined}
        >
          {node.icon ? (
            <DynamicIcon
              name={node.icon as IconName}
              className={cn(iconSizeVariants({ size: node.size }), 'text-white')}
            />
          ) : (
            node.fallback ?? '?'
          )}
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
