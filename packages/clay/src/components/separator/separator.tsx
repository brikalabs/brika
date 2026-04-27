'use client';

import { Separator as SeparatorPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../../primitives/cn';

/**
 * Separator. Border-driven so themes can override `--separator-width` to
 * make it thicker and `--separator-style` to make it dashed/double — the
 * line color comes from `--separator-color` (defaults to `--border`).
 * The wired-up width/style/color come from `./separator.css`; the rectangle
 * itself has zero block-size on horizontal and zero inline-size on
 * vertical so the rendered weight is purely the border.
 */
function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 data-[orientation=horizontal]:h-0 data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-0',
        className
      )}
      {...props}
    />
  );
}

export { Separator };
