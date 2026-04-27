'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../../primitives/cn';

/**
 * Track sizing reads `--switch-track-{height,width}` and the thumb reads
 * `--switch-thumb-size`. The unfocused border is a fixed 1px transparent
 * line so theming the global `--border-width` doesn't eat into the
 * track's content area; themes that need a thicker switch border should
 * override `--switch-border-width` (consumed via the `border-[var(--switch-border-width)]` utility in this component) and bump
 * the track tokens to match.
 */
function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  /** Preset size for the switch track and thumb. */
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch corner-themed box-border inline-flex shrink-0 items-center rounded-switch border-[length:1px] border-transparent p-0.5 shadow-surface outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-(--switch-track-height) data-[size=sm]:h-4 data-[size=default]:w-(--switch-track-width) data-[size=sm]:w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'corner-themed pointer-events-none block rounded-switch-thumb bg-background ring-0 transition-transform data-[state=checked]:translate-x-full data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:size-(--switch-thumb-size) group-data-[size=sm]/switch:size-3 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
