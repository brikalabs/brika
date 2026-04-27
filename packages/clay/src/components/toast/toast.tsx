import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../../primitives/cn';

/**
 * Wraps the app in Radix's Toast.Provider. A single provider should sit near the
 * root; render any number of `<Toast>` instances inside it. The `<Toaster>`
 * viewport must also be a descendant of this provider.
 */
function ToastProvider({
  swipeDirection = 'right',
  duration = 5000,
  ...props
}: Readonly<React.ComponentProps<typeof ToastPrimitive.Provider>>) {
  return <ToastPrimitive.Provider swipeDirection={swipeDirection} duration={duration} {...props} />;
}

const toastVariants = cva(
  'corner-themed group data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-toast border p-4 pr-6 shadow-toast transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[swipe=end]:animate-out data-[swipe=cancel]:transition-[transform_200ms_ease-out] data-[swipe=move]:transition-none',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * The toast viewport. A fixed region at the page edge where toasts mount.
 * Place this once, near the root, inside `<ToastProvider>`.
 */
function Toaster({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toaster"
      className={cn(
        'fixed top-0 z-50 flex max-h-screen w-full flex-col-reverse p-4 sm:top-auto sm:right-0 sm:bottom-0 sm:flex-col md:max-w-sm',
        className
      )}
      {...props}
    />
  );
}

/**
 * A single toast. Compose with `<ToastTitle>`, `<ToastDescription>`, and
 * optionally `<ToastClose>` / `<ToastAction>`.
 */
function Toast({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root> &
  VariantProps<typeof toastVariants> & {
    /** Visual treatment. `default` is neutral, `destructive` flags errors. */
    variant?: VariantProps<typeof toastVariants>['variant'];
    /** Extra Tailwind classes appended to the root. */
    className?: string;
  }) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-variant={variant}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * Bold heading line shown at the top of the toast.
 */
function ToastTitle({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title> & {
  /** Extra Tailwind classes appended to the title. */
  className?: string;
}) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn('font-semibold text-sm leading-none', className)}
      {...props}
    />
  );
}

/**
 * Secondary copy below the title.
 */
function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description> & {
  /** Extra Tailwind classes appended to the description. */
  className?: string;
}) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-sm opacity-90', className)}
      {...props}
    />
  );
}

/**
 * Dismiss button rendered as an X icon in the toast corner.
 */
function ToastClose({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Close> & {
  /** Extra Tailwind classes appended to the close button. */
  className?: string;
}) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      toast-close=""
      className={cn(
        "absolute top-2 right-2 rounded-xs p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-1 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600 group-[.destructive]:hover:text-red-50 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <XIcon />
      <span className="sr-only">Close</span>
    </ToastPrimitive.Close>
  );
}

/**
 * Action button (e.g. "Undo"). The `altText` prop is required by Radix for
 * screen-reader users who can't quickly reach the button.
 */
function ToastAction({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Action> & {
  /** Extra Tailwind classes appended to the action button. */
  className?: string;
}) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3 font-medium text-sm ring-offset-background transition-colors hover:bg-secondary focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:focus:ring-destructive group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Toast, ToastAction, ToastClose, ToastDescription, Toaster, ToastProvider, ToastTitle };
