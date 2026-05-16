/**
 * `<FocusActive active={…}>` — marks a subtree as visible/interactive
 * for the focus system.
 *
 * Use case: `<TabsContent>` keeps inactive panels mounted (with
 * `display:'none'`) so their state survives tab switches. Without
 * additional gating, a hidden `<Input autoFocus>` in the dormant
 * panel still registers with ink's focus manager and steals the
 * `autoFocus` claim from the visible tab's primary focusable.
 *
 * Wrap the inactive panel in `<FocusActive active={false}>` and any
 * descendant primitive that asks `useFocusActive()` (currently
 * `useFocusable`, `<Input>`, `<ScrollArea>`) gates its `useFocus` so
 * it drops out of the cycle while hidden.
 *
 * Nested providers AND together — the inner subtree is active only
 * when every enclosing wrapper is active.
 */

import type React from 'react';
import { createContext, type ReactNode, useContext } from 'react';

const FocusActiveContext = createContext<boolean>(true);

export interface FocusActiveProps {
  readonly active: boolean;
  readonly children?: ReactNode;
}

export function FocusActive({ active, children }: Readonly<FocusActiveProps>): React.ReactElement {
  const parent = useContext(FocusActiveContext);
  return (
    <FocusActiveContext.Provider value={parent && active}>{children}</FocusActiveContext.Provider>
  );
}

export function useFocusActive(): boolean {
  return useContext(FocusActiveContext);
}
