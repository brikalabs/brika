import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';
import { clickableProps } from './shared';

defineRenderer('image', ({ node, onAction }) => {
  const hasDimension = node.width != null || node.height != null;
  const clickable = !!node.onPress;
  const clickProps = clickableProps(node.onPress, onAction);

  const img = (
    <img
      src={node.src}
      alt={node.alt ?? ''}
      className={cn('h-full w-full', node.rounded && 'rounded-md')}
      style={{ objectFit: node.fit ?? 'cover' }}
      draggable={false}
    />
  );

  if (node.aspectRatio || hasDimension) {
    return (
      <div
        className={cn(
          'min-h-0 min-w-0 overflow-hidden',
          node.rounded && 'rounded-md',
          clickable && 'cursor-pointer'
        )}
        style={{
          ...(node.width == null ? {} : { width: node.width }),
          ...(node.height == null ? {} : { height: node.height }),
          ...(node.aspectRatio ? { aspectRatio: node.aspectRatio } : {}),
        }}
        {...clickProps}
      >
        {img}
      </div>
    );
  }

  // Default: fill available space
  if (!node.caption) {
    return (
      <div
        className={cn('min-h-0 flex-1 overflow-hidden rounded-md', clickable && 'cursor-pointer')}
        {...clickProps}
      >
        {img}
      </div>
    );
  }

  return (
    <figure
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-1 overflow-hidden',
        clickable && 'cursor-pointer'
      )}
      {...clickProps}
    >
      <div className="min-h-0 flex-1 overflow-hidden rounded-md">{img}</div>
      <figcaption className="shrink-0 text-[11px] text-muted-foreground">{node.caption}</figcaption>
    </figure>
  );
});
