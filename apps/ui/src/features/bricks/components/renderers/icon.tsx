import type { IconNode } from '@brika/ui-kit';
import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { memo } from 'react';

const iconVariants = cva('shrink-0', {
  variants: {
    size: {
      sm: 'size-3.5',
      md: 'size-5',
      lg: 'size-7',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const IconRenderer = memo(function IconRenderer({ node }: { node: IconNode }) {
  return (
    <DynamicIcon
      name={node.name as IconName}
      className={iconVariants({ size: node.size })}
      style={node.color ? { color: node.color } : undefined}
    />
  );
});
