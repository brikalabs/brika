import { type RefObject, useEffect } from 'react';

/**
 * Wire up "click outside the wrapper" + Escape-key dismissal for a
 * disclosure-style component (popover, dropdown, menu).
 *
 * Effect is gated on `open`, so listeners only run while the disclosure
 * is visible. Pass a ref to the outer-most element of the disclosure;
 * any pointerdown outside that element fires `onDismiss`. The Escape
 * keystroke fires it too.
 */
export function useDismiss(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onDismiss: () => void
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        onDismiss();
      }
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };
    globalThis.addEventListener('mousedown', onPointerDown);
    globalThis.addEventListener('keydown', onKeydown);
    return () => {
      globalThis.removeEventListener('mousedown', onPointerDown);
      globalThis.removeEventListener('keydown', onKeydown);
    };
  }, [open, rootRef, onDismiss]);
}
