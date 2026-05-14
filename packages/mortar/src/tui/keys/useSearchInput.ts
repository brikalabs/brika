/**
 * Search-prompt sub-mode handler. While the user is typing a `/pattern`
 * query the regular keybinds are suspended; this hook captures every
 * keystroke into the search input buffer.
 *
 *   Enter      commit the query (sets `search.query`)
 *   Esc        discard the in-progress input and exit
 *   Backspace  pop one char
 *   any other  append to the input buffer
 */

import { useInput } from 'ink';
import { useMortar } from '../useMortar';

export function useSearchInput(enabled: boolean): void {
  const { search } = useMortar();
  useInput(
    (input, key) => {
      if (key.escape) {
        search.cancel();
        return;
      }
      if (key.return) {
        search.commit();
        return;
      }
      if (key.backspace || key.delete) {
        search.backspace();
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        search.type(input);
      }
    },
    { isActive: enabled }
  );
}
