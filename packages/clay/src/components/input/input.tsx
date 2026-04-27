import * as React from 'react';

import { cn } from '../../primitives/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'corner-themed border-(length:--input-border-width) h-(--input-height) w-full min-w-0 rounded-input border-input-border bg-input-container px-(--input-padding-x) py-(--input-padding-y) text-base text-input-label shadow-surface outline-none transition-[color,box-shadow] duration-(--input-duration) ease-(--input-easing) [border-style:var(--input-border-style)] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-input-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:ring-themed',
        'aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Input };
