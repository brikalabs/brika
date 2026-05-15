/**
 * `<KeyScope>` — boundary that opts descendant `useKey` calls out of
 * the auto-suspend-on-capture behaviour.
 *
 * Mental model: shell-level shortcuts (`?`, `d`, `p`, `q`, …) should
 * NOT fire while an `<Input>` / `<Confirm>` / `<Form>` is collecting
 * keystrokes — so they auto-suspend when `useTuiShell().isInputCaptured`
 * is true. Component-internal binds (e.g. `<Search>`'s `↑↓` /
 * `Ctrl+Enter`) live in the *same* focus zone as their inner input
 * and DO need to keep firing, even though `isInputCaptured` is true.
 *
 * Mark that zone with `<KeyScope>`:
 *
 *   <KeyScope>
 *     <SearchInput />    // captures input
 *     <Results />        // useKey here keeps firing (in-scope)
 *   </KeyScope>
 *
 * `useKey` reads the surrounding scope flag — when it's `true`, the
 * auto-suspend is skipped. Shell keys (registered outside any
 * `<KeyScope>`) keep their normal suspend-on-capture behaviour, so
 * typing in a search field never triggers `q` to quit, `d` to
 * navigate, etc.
 */

import type React from 'react';
import { createContext, type ReactNode, useContext } from 'react';

const KeyScopeContext = createContext<boolean>(false);

export function useInKeyScope(): boolean {
  return useContext(KeyScopeContext);
}

export interface KeyScopeProps {
  readonly children?: ReactNode;
}

export function KeyScope({ children }: Readonly<KeyScopeProps>): React.ReactElement {
  return <KeyScopeContext.Provider value={true}>{children}</KeyScopeContext.Provider>;
}
