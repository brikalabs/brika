import { NAV_SECTIONS } from '../../sections';

export const MAX_ROWS = 4;

/** Look up the current numeric hotkey for a section so the per-tile
 *  footer hints stay in sync with the nav (no more stale `p`/`w`). */
export function hotkeyFor(key: string): string {
  return NAV_SECTIONS.find((s) => s.key === key)?.hotkey ?? '?';
}
