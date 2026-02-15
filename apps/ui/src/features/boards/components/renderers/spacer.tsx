import { cva } from 'class-variance-authority';
import { defineRenderer } from './registry';

const spacerVariants = cva('', {
  variants: {
    size: {
      sm: 'h-0.5 w-0.5 @xs:h-1 @xs:w-1 shrink-0',
      md: 'h-1 w-1 @xs:h-2 @xs:w-2 shrink-0',
      lg: 'h-2 w-2 @xs:h-4 @xs:w-4 shrink-0',
    },
  },
});

defineRenderer('spacer', ({ node }) => {
  if (node.size) {
    return <div className={spacerVariants({ size: node.size })} />;
  }
  return <div className="flex-1" />;
});
