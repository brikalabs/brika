/**
 * `<KeyScope>` — opts the descendant `useShortcut` / `useRawInput`
 * calls back into firing while the shell's input-capture counter is
 * non-zero.
 *
 * Mental model: shell-level shortcuts (`?`, `d`, `p`, `q`, …) auto-
 * suspend when an `<Input>` / `<Confirm>` / `<Form>` is mounted, so
 * typing `q` doesn't quit the app. Some component-internal shortcuts
 * still need to fire during that capture — e.g. `<Search>`'s `↑` / `↓`
 * navigates the results list, `Ctrl+Enter` triggers the action. Mark
 * that zone with `<KeyScope>` and those binds keep working:
 *
 *   <KeyScope>
 *     <SearchInput />       // captures input
 *     <Results />            // useShortcut(↑/↓) keeps firing
 *   </KeyScope>
 *
 * Plain `useShortcut` outside any `<KeyScope>` keeps its normal
 * suspend-on-capture behaviour. Consumers never have to think about
 * the flag — the wrapper is the whole API.
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
