/**
 * `<Focusable>` — the one tab-reachable + clickable + Enter-activatable
 * primitive in the TUI. Buttons, list items, cards, menu items —
 * everything you can "press" — composes from this.
 *
 *   <Focusable shortcut="e" onPress={enable}>enable</Focusable>
 *   <Focusable onPress={() => open(item)}><Card>…</Card></Focusable>
 *
 * Folds four affordances into one component:
 *   1. Joins ink's Tab cycle (`tabIndex={-1}` opts out).
 *   2. `Enter` / `Space` while focused fires `onPress`.
 *   3. Left-click anywhere inside grabs focus *and* fires `onPress`.
 *   4. Optional `shortcut` registers a global key binding that fires
 *      whenever the spec is pressed (auto-suspended while typing in
 *      an `<Input>` / `<Form>` / `<Confirm>`).
 *
 * Renders a transparent `<Box>` around the children plus an optional
 * `▸` focus marker.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { type ReactNode, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';
import { useShortcut } from '../keys/useShortcut';

export interface FocusableProps {
  readonly onPress?: () => void;
  /** Optional key spec — `e`, `D`, `ctrl+s`, `enter`, `escape`, … */
  readonly shortcut?: string;
  /** Disable focus + activation (and any owned shortcut). Default `true`. */
  readonly enabled?: boolean;
  /** DOM-style tab order. `-1` opts out of the cycle but stays clickable. */
  readonly tabIndex?: number;
  /** Stable focus id. Auto-generated when omitted. */
  readonly id?: string;
  readonly autoFocus?: boolean;
  /** Show a `▸` glyph in front of the children when focused. Default `true`. */
  readonly showFocusMarker?: boolean;
  /** Pass-through to the wrapping Box. */
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly children?: ReactNode;
}

const noop = (): void => undefined;

export function Focusable({
  onPress,
  shortcut,
  enabled = true,
  tabIndex,
  id,
  autoFocus,
  showFocusMarker = true,
  flexGrow,
  flexShrink,
  flexBasis,
  children,
}: Readonly<FocusableProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { isFocused } = useFocusable({
    id,
    tabIndex,
    autoFocus,
    onPress,
    enabled: enabled && Boolean(onPress),
    ref,
  });
  // Shortcut fires globally (auto-suspended during input capture).
  useShortcut(shortcut ?? '', onPress ?? noop, enabled && Boolean(onPress) && Boolean(shortcut));

  return (
    <Box ref={ref} flexGrow={flexGrow} flexShrink={flexShrink} flexBasis={flexBasis}>
      {isFocused && showFocusMarker ? (
        <Text color="cyan" bold>
          {'▸ '}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
