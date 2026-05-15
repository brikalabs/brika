/**
 * `<Clickable>` — wrap anything to make it respond to mouse clicks.
 *
 *   <Clickable onPress={() => open(item)}>
 *     <Card title="Plugin">…</Card>
 *   </Clickable>
 *
 * Renders a transparent `<Box>` around the children with a ref the
 * `useClickable` hook uses to hit-test the click. The Box's flex
 * defaults mirror raw `<Box>` so dropping `<Clickable>` around an
 * existing primitive doesn't shift the layout — it's just a click
 * affordance, not a layout primitive.
 *
 * Use this when you want a card / tile / row to be tappable without
 * teaching every primitive about mouse events. For tighter cases
 * (Menu items, Tab triggers, Search rows) the primitive itself uses
 * `useClickable` internally so consumers don't need this wrapper.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { type ReactNode, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';
import { useClickable } from '../mouse/useClickable';

export interface ClickableProps {
  readonly onPress?: () => void;
  /** Default `true`. Set `false` to silence clicks without unmounting. */
  readonly enabled?: boolean;
  /** DOM-style tab order — `-1` opts out of the Tab cycle. Default `0`. */
  readonly tabIndex?: number;
  /** Stable focus id. Auto-generated when omitted. */
  readonly id?: string;
  /** Show a `▸` glyph in front of the children when focused. Default `true`.
   *  Set `false` when the wrapped child already paints its own focus marker
   *  (e.g. it's a `<Card>` with a focused border). */
  readonly showFocusMarker?: boolean;
  /** Pass-through to the wrapping Box. Useful when the clickable
   *  needs to participate in the parent's flex layout the same way
   *  the unwrapped child would. */
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly children?: ReactNode;
}

export function Clickable({
  onPress,
  enabled = true,
  tabIndex,
  id,
  showFocusMarker = true,
  flexGrow,
  flexShrink,
  flexBasis,
  children,
}: Readonly<ClickableProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { isFocused } = useFocusable({
    id,
    tabIndex,
    onPress,
    enabled: enabled && Boolean(onPress),
  });
  useClickable(ref, onPress, enabled);
  return (
    <Box ref={ref} flexGrow={flexGrow} flexShrink={flexShrink} flexBasis={flexBasis}>
      {isFocused && showFocusMarker ? (
        <Text color="cyan" bold>
          ▸{' '}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
