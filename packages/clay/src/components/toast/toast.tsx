'use client';

import type { ComponentProps, CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

import { cn } from '../../primitives/cn';

const INTENTS = ['normal', 'success', 'error', 'warning', 'info'] as const;
const INTENT_TOKENS: Record<(typeof INTENTS)[number], readonly [string, string]> = {
  normal: ['popover', 'border'],
  success: ['success', 'success'],
  error: ['destructive', 'destructive'],
  warning: ['warning', 'warning'],
  info: ['info', 'info'],
};

/**
 * Bind Sonner's intent vars (`--<intent>-bg|text|border`) to Clay role tokens.
 * Inline `style` (specificity 1,0,0,0) beats Sonner's runtime-injected
 * `[data-sonner-toaster][data-sonner-theme=light]` rules (0,2,0); the values
 * cascade down to each toast and re-paint with `data-theme` / `data-mode`.
 */
const sonnerVars: CSSProperties = Object.fromEntries(
  INTENTS.flatMap((intent) => {
    const [color, border] = INTENT_TOKENS[intent];
    return [
      [`--${intent}-bg`, `var(--${color})`],
      [`--${intent}-text`, `var(--${color}-foreground)`],
      [`--${intent}-border`, `var(--${border})`],
    ];
  })
);

/**
 * Clay-themed Sonner viewport. Mount once near the app root, then trigger
 * notifications anywhere with the imperative `toast()` API.
 *
 * Color mode tracks Clay's `data-mode` automatically: every Sonner rule that
 * resolves a color goes through one of our `--<intent>-*` overrides, and the
 * two rules Sonner hardcodes (description, close button) are pinned to Clay
 * tokens via `classNames` below.
 */
function Toaster({ className, style, toastOptions, ...props }: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      data-slot="toaster"
      className={cn('toaster group', className)}
      style={{ ...sonnerVars, ...style }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: 'corner-themed rounded-toast! shadow-toast!',
          description: 'text-muted-foreground!',
          closeButton: 'bg-popover! border-border! text-popover-foreground! hover:bg-accent!',
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
export { Toaster };
