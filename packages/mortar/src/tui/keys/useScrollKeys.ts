/**
 * Scroll keybinds for the log pane: arrows, PgUp/PgDn, g/G.
 *
 *   ↑ / ↓          one line
 *   Shift+↑ / ↓    TUI_FAST_SCROLL_LINES at a time
 *   PgUp / PgDn    half a page
 *   g              jump to top of buffer
 *   G              snap back to live-tail
 */

import { useShortcut } from '@brika/tui';
import { TUI_FAST_SCROLL_LINES } from '../../constants';
import { useMortar } from '../useMortar';

export function useScrollKeys(enabled: boolean): void {
  const { scroll, layout } = useMortar();

  useShortcut('upArrow', () => scroll.scrollUp(1), enabled);
  useShortcut('shift+upArrow', () => scroll.scrollUp(TUI_FAST_SCROLL_LINES), enabled);
  useShortcut('downArrow', () => scroll.scrollDown(1), enabled);
  useShortcut('shift+downArrow', () => scroll.scrollDown(TUI_FAST_SCROLL_LINES), enabled);
  useShortcut('pageUp', () => scroll.scrollUp(layout.pageSize), enabled);
  useShortcut('pageDown', () => scroll.scrollDown(layout.pageSize), enabled);
  useShortcut('g', () => scroll.goTop(), enabled);
  useShortcut('G', () => scroll.goLive(), enabled);
}
