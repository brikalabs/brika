'use client';

import * as React from 'react';
import { Toaster as Sonner } from 'sonner';

import { cn } from '../../primitives/cn';

/**
 * Mirrors `data-mode` (or the legacy `.dark` class) on `<html>` so Sonner's
 * own `data-sonner-theme` switches with the Clay color mode. Without this,
 * Sonner's hardcoded dark-mode rules (e.g. cancel-button background) would
 * stay light even when the rest of the app is dark.
 */
function useClayMode(): 'light' | 'dark' {
  const [mode, setMode] = React.useState<'light' | 'dark'>('light');
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const isDark = root.dataset.mode === 'dark' || root.classList.contains('dark');
      setMode(isDark ? 'dark' : 'light');
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-mode', 'class'] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return mode;
}

/**
 * Bridge Sonner's CSS variables to Clay role tokens. Set as an inline
 * `style` attribute (specificity 1,0,0,0) so Clay's bindings beat Sonner's
 * own `[data-sonner-toaster][data-sonner-theme=light]` (0,2,0) rules. The
 * variables cascade down to each toast via inheritance, and every active
 * Clay theme (`data-theme`) and color mode (`data-mode`) re-paints the
 * surface for free.
 */
const sonnerVars: React.CSSProperties = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--success-bg': 'var(--success)',
  '--success-text': 'var(--success-foreground)',
  '--success-border': 'var(--success)',
  '--error-bg': 'var(--destructive)',
  '--error-text': 'var(--destructive-foreground)',
  '--error-border': 'var(--destructive)',
  '--warning-bg': 'var(--warning)',
  '--warning-text': 'var(--warning-foreground)',
  '--warning-border': 'var(--warning)',
  '--info-bg': 'var(--info)',
  '--info-text': 'var(--info-foreground)',
  '--info-border': 'var(--info)',
  '--border-radius': 'var(--toast-radius)',
};

function Toaster({
  className,
  style,
  toastOptions,
  ...props
}: React.ComponentProps<typeof Sonner>) {
  const mode = useClayMode();
  return (
    <Sonner
      data-slot="toaster"
      theme={mode}
      className={cn('toaster group', className)}
      style={{ ...sonnerVars, ...style }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: 'corner-themed shadow-toast!',
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
export { Toaster };
