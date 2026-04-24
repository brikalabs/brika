import * as React from 'react';

import { cn } from '../../primitives/cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'corner-input field-sizing-content flex min-h-16 w-full rounded-input border border-input-border bg-input-container px-3 py-2 text-base text-input-label shadow-surface outline-none transition-[color,box-shadow] placeholder:text-input-placeholder focus-visible:ring-themed disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
