/**
 * `useFocusable` — DOM-style focus + activation in one hook.
 *
 *   function Card({ onPress, tabIndex }: Props) {
 *     const ref = useRef<DOMElement>(null);
 *     const { isFocused } = useFocusable({ ref, onPress, tabIndex });
 *     return <Box ref={ref} borderColor={isFocused ? 'cyan' : 'gray'}>…</Box>;
 *   }
 *
 * Folds four patterns the codebase keeps re-implementing:
 *   1. `useFocus` registration with a stable id.
 *   2. `Enter` / `Space` → `onPress` while focused.
 *   3. **Click → focus**: when `ref` is supplied, a left-click inside
 *      that element grabs focus *and* fires `onPress`. Consumers no
 *      longer have to wire a separate `useClickable` to make click
 *      focus the slot.
 *   4. A `tabIndex` prop that mirrors the HTML rule:
 *      - `0` (default for interactive elements) — focusable, included
 *        in the Tab cycle in mount order.
 *      - `-1` — not in the Tab cycle, but still focusable
 *        programmatically (via `useFocusManager().focus(id)` or
 *        mouse click on `ref`).
 *      - positive — same as `0` for now. Ink's focus manager cycles in
 *        registration order; honouring a positive priority would need
 *        a custom manager. Left as-is rather than half-implementing.
 *
 * Pass `suppressActivation` to keep `useFocus` + the cycle behaviour
 * but bind `Enter` / `Space` yourself (e.g. `Input` wants Enter to
 * commit text, not fire `onPress`).
 */

import { type DOMElement, useFocus, useFocusManager, useInput } from 'ink';
import { type RefObject, useCallback, useId, useRef } from 'react';
import { useClickable } from '../mouse/useClickable';

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
  /** Optional element ref. When provided, a left-click anywhere
   *  inside the ref's bounds focuses this slot (so subsequent arrow
   *  / Enter input lands here) and fires `onPress`. */
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
  const inTabCycle = enabled && tabIndex !== -1;
  const { isFocused } = useFocus({
    id: focusId,
    autoFocus: opts.autoFocus,
    isActive: inTabCycle,
  });
  const { focus } = useFocusManager();

  // Activation via Enter / Space.
  useInput(
    (input, key) => {
      if (!opts.onPress) {
        return;
      }
      if (key.return || input === ' ') {
        opts.onPress();
      }
    },
    { isActive: isFocused && enabled && !opts.suppressActivation }
  );

  // Click → focus + activation. The hook is unconditional (Rules of
  // Hooks): when `ref` is omitted, the click handler hits a dummy ref
  // whose `current` is always null, so `useClickable` never fires.
  const dummyRef = useRef<DOMElement | null>(null);
  const onClickFocus = useCallback(() => {
    if (!enabled) {
      return;
    }
    focus(focusId);
    opts.onPress?.();
  }, [enabled, focus, focusId, opts.onPress]);
  useClickable(opts.ref ?? dummyRef, opts.ref ? onClickFocus : undefined, enabled);

  return { isFocused, focusId };
}
