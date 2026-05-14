/**
 * Scroll keybinds for the log pane: arrows, PgUp/PgDn, g/G.
 *
 *   ↑ / ↓          one line
 *   Shift+↑ / ↓    TUI_FAST_SCROLL_LINES at a time
 *   PgUp / PgDn    half a page
 *   g              jump to top of buffer
 *   G              snap back to live-tail
 */

import { useKey } from '@brika/tui';
import { TUI_FAST_SCROLL_LINES } from '../../constants';
import { useMortar } from '../useMortar';

export function useScrollKeys(enabled: boolean): void {
  const { scroll, layout } = useMortar();

  useKey('upArrow', () => scroll.scrollUp(1), enabled);
  useKey('shift+upArrow', () => scroll.scrollUp(TUI_FAST_SCROLL_LINES), enabled);
  useKey('downArrow', () => scroll.scrollDown(1), enabled);
  useKey('shift+downArrow', () => scroll.scrollDown(TUI_FAST_SCROLL_LINES), enabled);
  useKey('pageUp', () => scroll.scrollUp(layout.pageSize), enabled);
  useKey('pageDown', () => scroll.scrollDown(layout.pageSize), enabled);
  useKey('g', () => scroll.goTop(), enabled);
  useKey('G', () => scroll.goLive(), enabled);
}
