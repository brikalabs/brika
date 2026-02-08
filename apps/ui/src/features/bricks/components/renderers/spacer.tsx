import type { SpacerNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { memo } from 'react';

const spacerVariants = cva('', {
  variants: {
    size: {
      sm: 'h-1 w-1 shrink-0',
      md: 'h-2 w-2 shrink-0',
      lg: 'h-4 w-4 shrink-0',
    },
  },
});

export const SpacerRenderer = memo(function SpacerRenderer({ node }: { node: SpacerNode }) {
  if (node.size) {
    return <div className={spacerVariants({ size: node.size })} />;
  }
  return <div className="flex-1" />;
});
