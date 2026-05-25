/**
 * Keybinds for the main view. One `useKey` call per binding — each line
 * reads like a row in a cheatsheet. No dispatch tables, no helpers, no
 * `useInput` directly.
 *
 * Search has two modes:
 *   - `normal`     — all the regular keybinds below
 *   - `searching`  — `useSearchInput` captures typed chars into the
 *                    search prompt; the regular binds are disabled.
 *
 * Scroll keys (`↑` / `↓` / `PgUp` / `g` / `G` / …) are NOT registered
 * here — they live in [LogPanel] and are gated on the log pane owning
 * focus, so the same keys can mean different things when the service
 * list owns focus instead.
 */

import { useMortar } from '../useMortar';
import { useNavigationKeys } from './useNavigationKeys';
import { useSearchInput } from './useSearchInput';
import { useServiceActionKeys } from './useServiceActionKeys';

export function useMainKeybinds(): void {
  const { search } = useMortar();
  const normal = search.mode === 'normal';
  const searching = search.mode === 'searching';

  useNavigationKeys(normal);
  useServiceActionKeys(normal);
  useSearchInput(searching);
}
