/**
 * One-line transient status message. Auto-clears after `durationMs`
 * (default 4s) so the underlying keybinds line shows back through.
 * Calling `showToast` while one is up replaces it AND resets the timer.
 */

import { useEffect, useState } from 'react';

const DEFAULT_TOAST_MS = 4_000;

export interface ToastControls {
  /** Current message, or `null` when no toast is showing. */
  readonly toast: string | null;
  /** Show a transient message. Replaces any in-flight toast. */
  readonly showToast: (message: string) => void;
}

export function useToast(durationMs: number = DEFAULT_TOAST_MS): ToastControls {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const t = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs]);
  return { toast, showToast: setToast };
}
