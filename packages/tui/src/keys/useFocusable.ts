/**
 * `useFocusable` — focus + activation in one hook for components that
 * paint their own chrome (Card, Pane, MenuBar item, List, Button).
 *
 *   function Card({ onPress }: Props) {
 *     const ref = useRef<DOMElement>(null);
 *     const { isFocused } = useFocusable({ ref, onPress });
 *     return <Box ref={ref} borderColor={isFocused ? 'cyan' : 'gray'}>…</Box>;
 *   }
 *
 * Folds three patterns:
 *   1. Focus slot via ink's `useFocus` — joins the Tab cycle.
 *   2. `Enter` / `Space` while focused → `onPress`.
 *   3. Left-click anywhere inside `ref` → focus + `onPress`.
 *
 * `tabIndex` mirrors the HTML rule:
 *   - `0` (default) — focusable, in the Tab cycle.
 *   - `-1`          — not in the cycle, still clickable and
 *                     programmatically focusable.
 *
 * Pass `suppressActivation` when the consumer binds Enter / Space
 * itself (e.g. `<Input>` wants Enter to commit text, not call onPress).
 *
 * Inherits `<FocusActive>` from context — an inactive surrounding
 * container (a hidden `<TabsContent>`) deactivates the slot.
 */

import { type DOMElement, useFocus, useFocusManager, useInput } from 'ink';
import { type RefObject, useCallback, useId, useRef } from 'react';
import { useClickable } from '../mouse/useClickable';
import { useFocusActive } from './FocusActive';

export interface UseFocusableOptions {
  /** Stable id — defaults to a per-instance auto id. Supply one when
   *  another component needs to `focus(id)` this one imperatively. */
  readonly id?: string;
  /** DOM-style tab order. Default `0`. */
  readonly tabIndex?: number;
  /** Claim focus on mount when no other focusable owns it. */
  readonly autoFocus?: boolean;
  /** When `false`, the slot disables itself entirely — `useFocus`
   *  becomes inactive and the activation handler stays bound but
   *  inert. */
  readonly enabled?: boolean;
  /** Fired on `Enter` / `Space` while focused, or on a left-click
   *  inside `ref`. */
  readonly onPress?: () => void;
  /** Skip the default Enter/Space → onPress binding when the consumer
   *  wires its own input handler. Focus registration still happens. */
  readonly suppressActivation?: boolean;
  /** Optional element ref. When provided, a left-click inside the
   *  ref's bounds focuses this slot AND fires `onPress`. */
  readonly ref?: RefObject<DOMElement | null>;
}

export interface FocusableState {
  readonly isFocused: boolean;
  readonly focusId: string;
}

export function useFocusable(opts: Readonly<UseFocusableOptions> = {}): FocusableState {
  const autoId = useId();
  const focusId = opts.id ?? `focusable-${autoId}`;
  const enabled = opts.enabled ?? true;
  const tabIndex = opts.tabIndex ?? 0;
  // Gate on the surrounding `<FocusActive>` so primitives inside a
  // hidden tab panel don't compete for the Tab cycle / autoFocus.
  const containerActive = useFocusActive();
  const inTabCycle = enabled && tabIndex !== -1 && containerActive;

  const { isFocused } = useFocus({
    id: focusId,
    autoFocus: opts.autoFocus && containerActive,
    isActive: inTabCycle,
  });
  const { focus } = useFocusManager();

  // Latch the activation callback so the listeners don't need to
  // re-subscribe on every render of the parent.
  const onPressRef = useRef(opts.onPress);
  onPressRef.current = opts.onPress;

  // Enter / Space → onPress while focused.
  useInput(
    (input, key) => {
      if (key.return || input === ' ') {
        onPressRef.current?.();
      }
    },
    { isActive: isFocused && enabled && !opts.suppressActivation && Boolean(opts.onPress) }
  );

  // Click → focus + onPress. Calling `focus(focusId)` first ensures
  // subsequent keyboard input lands on this element.
  const dummyRef = useRef<DOMElement | null>(null);
  const onClick = useCallback(() => {
    if (!enabled) {
      return;
    }
    focus(focusId);
    onPressRef.current?.();
  }, [enabled, focus, focusId]);
  useClickable(opts.ref ?? dummyRef, opts.ref ? onClick : undefined, enabled);

  return { isFocused, focusId };
}
