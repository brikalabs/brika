'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../../primitives/cn';

/**
 * Binary toggle built on Radix's `Checkbox` primitive. Supports controlled
 * usage (`checked` + `onCheckedChange`) and uncontrolled usage
 * (`defaultChecked`). Pass `checked="indeterminate"` to render the dash
 * glyph instead of the check mark.
 *
 * Sizing reads `--checkbox-size` at the default size and overrides via
 * `data-size`. The 1px resting border consumes `--checkbox-border-width`
 * so themes can thicken it without leaking into siblings.
 */
function Checkbox({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  /**
   * Preset edge length for the box.
   * - `sm` — `size-3.5`
   * - `default` — `size-4`
   * - `lg` — `size-5`
   */
  size?: 'sm' | 'default' | 'lg';
  /** Additional Tailwind / utility classes merged with the base recipe. */
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-size={size}
      className={cn(
        'peer corner-themed border-(length:--checkbox-border-width) inline-flex shrink-0 items-center justify-center rounded-checkbox border-input-border bg-input-container shadow-surface outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-themed disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:size-4 data-[size=lg]:size-5 data-[size=sm]:size-3.5 data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:text-primary-foreground dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current [&>svg]:size-[80%] [&>svg]:shrink-0"
      >
        {props.checked === 'indeterminate' ? <Minus strokeWidth={3} /> : <Check strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
