import type { TextNode } from '@brika/ui-kit';
import { memo } from 'react';
import { cn } from '@/lib/utils';

export const TextRenderer = memo(function TextRenderer({ node }: { node: TextNode }) {
  return (
    <p
      className={cn(
        'shrink-0',
        node.variant === 'heading' && 'font-semibold text-sm',
        node.variant === 'caption' && 'text-[11px] text-muted-foreground',
        (!node.variant || node.variant === 'body') && 'text-xs'
      )}
      style={node.color ? { color: node.color } : undefined}
    >
      {node.content}
    </p>
  );
});
