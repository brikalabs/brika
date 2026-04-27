import * as React from 'react';

import { cn } from '../../primitives/cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'corner-themed field-sizing-content border-(length:--input-border-width) flex min-h-16 w-full rounded-input border-input-border bg-input-container px-(--textarea-padding-x) py-(--textarea-padding-y) text-base text-input-label shadow-surface outline-none transition-[color,box-shadow] duration-(--input-duration) ease-(--input-easing) [border-style:var(--input-border-style)] placeholder:text-input-placeholder focus-visible:ring-themed disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
