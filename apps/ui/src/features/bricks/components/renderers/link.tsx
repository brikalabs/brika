import { cva } from 'class-variance-authority';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { defineRenderer } from './registry';

const linkVariants = cva('inline-flex items-center gap-1 transition-colors', {
  variants: {
    variant: {
      default: 'text-primary hover:text-primary/80',
      muted: 'text-muted-foreground hover:text-foreground',
      underline: 'text-primary underline underline-offset-2 hover:text-primary/80',
    },
    size: {
      xs: 'text-[11px]',
      sm: 'text-xs',
      md: 'text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'sm',
  },
});

defineRenderer('link', ({ node }) => (
  <a
    href={node.url}
    target="_blank"
    rel="noopener noreferrer"
    className={linkVariants({ variant: node.variant, size: node.size })}
  >
    {node.icon && <DynamicIcon name={node.icon as IconName} className="size-3 shrink-0" />}
    {node.label}
  </a>
));
