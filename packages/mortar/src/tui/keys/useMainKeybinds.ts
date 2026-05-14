/**
 * Keybinds for the main view. One `useKey` call per binding — each line
 * reads like a row in a cheatsheet. No dispatch tables, no helpers, no
 * `useInput` directly.
 *
 * Search has two modes:
 *   - `normal`     — all the regular keybinds below
 *   - `searching`  — `useSearchInput` captures typed chars into the
 *                    search prompt; the regular binds are disabled.
 */

import { useMortar } from '../useMortar';
import { useNavigationKeys } from './useNavigationKeys';
import { useScrollKeys } from './useScrollKeys';
import { useSearchInput } from './useSearchInput';
import { useServiceActionKeys } from './useServiceActionKeys';

export function useMainKeybinds(): void {
  const { search } = useMortar();
  const normal = search.mode === 'normal';
  const searching = search.mode === 'searching';

  useScrollKeys(normal);
  useNavigationKeys(normal);
  useServiceActionKeys(normal);
  useSearchInput(searching);
}
