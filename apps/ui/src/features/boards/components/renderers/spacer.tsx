import { cva } from 'class-variance-authority';
import { defineRenderer } from './registry';

const spacerVariants = cva('', {
  variants: {
    size: {
      sm: '@xs:h-1 h-0.5 @xs:w-1 w-0.5 shrink-0',
      md: '@xs:h-2 h-1 @xs:w-2 w-1 shrink-0',
      lg: '@xs:h-4 h-2 @xs:w-4 w-2 shrink-0',
    },
  },
});

defineRenderer('spacer', ({ node }) => {
  if (node.size) {
    return <div className={spacerVariants({ size: node.size })} />;
  }
  return <div className="flex-1" />;
});
