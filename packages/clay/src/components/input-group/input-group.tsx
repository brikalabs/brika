'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../primitives/cn';
import { Button } from '../button';
import { Input } from '../input';
import { Textarea } from '../textarea';

/**
 * Wrapper for compound input controls (PasswordInput, search bars, fields
 * with prefix/suffix addons). Mirrors the standalone Input's token surface
 * exactly — `rounded-input`, `h-[var(--input-height)]`, `bg-input-container`,
 * `border-input-border`, `shadow-surface` — and carries `data-slot="input"`
 * on the wrapper so the same `../input/input.css` rules (border-width,
 * border-style, transition) apply. Themes that tune `--input-*` retune
 * PasswordInput to match without any extra theming work.
 */
function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input"
      data-input-variant="group"
      role="group"
      className={cn(
        'group/input-group corner-input relative flex w-full items-center rounded-input border border-input-border bg-input-container text-input-label shadow-surface outline-none transition-[color,box-shadow]',
        'h-[var(--input-height)] min-w-0 has-[>textarea]:h-auto',

        // Variants based on alignment.
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

        // Focus state.
        'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50',

        // Error state.
        'has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',

        className
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text select-none items-center justify-center gap-2 py-1.5 font-medium text-muted-foreground text-sm group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
        'inline-end': 'order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
        'block-start':
          'order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5 [.border-b]:pb-3',
        'block-end':
          'order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5 [.border-t]:pt-3',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  }
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof inputGroupAddonVariants> & {
    /** Which edge the addon docks against. */
    align?: VariantProps<typeof inputGroupAddonVariants>['align'];
  }) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        inputGroupAddonVariants({
          align,
        }),
        className
      )}
      onClick={(e) => {
        const target = e.target;
        if (target instanceof HTMLElement && target.closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.currentTarget.parentElement?.querySelector('input')?.focus();
        }
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva('flex items-center gap-2 text-sm shadow-none', {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: 'h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5',
      'icon-xs': 'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
    },
  },
  defaultVariants: {
    size: 'xs',
  },
});

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    /** Visual preset for the addon button. */
    variant?: React.ComponentProps<typeof Button>['variant'];
    /** Size preset for the addon button. */
    size?: VariantProps<typeof inputGroupButtonVariants>['size'];
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(
        inputGroupButtonVariants({
          size,
        }),
        className
      )}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

/**
 * The inner control inside an `InputGroup`. Strips border, radius,
 * background, and shadow — those live on the wrapper. Uses `h-full` so
 * the wrapper's `--input-height` (minus the wrapper's border) drives the
 * rendered height; without that, theming `--input-border-width` to a
 * thicker value would push the inner control past the wrapper's content
 * area.
 */
function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'h-full flex-1 rounded-none border-0 bg-transparent shadow-none',
        // Suppress the standalone `ring-themed` outline on the inner control.
        // The wrapper paints the focus ring (via `has-[…:focus-visible]:ring-…`),
        // so the inner field only needs to clear its own outline.
        'focus-visible:[outline:none]',
        className
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none',
        'focus-visible:[outline:none]',
        className
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
