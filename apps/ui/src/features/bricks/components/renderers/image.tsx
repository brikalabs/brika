import type { ImageNode } from '@brika/ui-kit';
import { memo } from 'react';
import { cn } from '@/lib/utils';

export const ImageRenderer = memo(function ImageRenderer({ node }: { node: ImageNode }) {
  const hasDimension = node.width != null || node.height != null;

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
        )}
        style={{
          ...(node.width != null ? { width: node.width } : {}),
          ...(node.height != null ? { height: node.height } : {}),
          ...(node.aspectRatio ? { aspectRatio: node.aspectRatio } : {}),
        }}
      >
        {img}
      </div>
    );
  }

  // Default: fill available space
  if (!node.caption) {
    return <div className="min-h-0 flex-1 overflow-hidden rounded-md">{img}</div>;
  }

  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden rounded-md">{img}</div>
      <figcaption className="shrink-0 text-[11px] text-muted-foreground">{node.caption}</figcaption>
    </figure>
  );
});
