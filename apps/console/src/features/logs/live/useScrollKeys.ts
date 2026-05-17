import { useScroll, useShortcut } from '@brika/tui';

export const VIEW_CHROME = 4;

export function useScrollKeys(
  scroll: ReturnType<typeof useScroll>,
  pageSize: number,
  enabled: boolean
): void {
  // `↑` / `↓` are exposed as on-screen `<Button shortcut="upArrow">`
  // chips in the ActionsRow — Button registers its own shortcut and
  // would double-fire if we also bound them here. The page-step keys
  // stay hookless (no buttons for them, just keyboard).
  useShortcut('pageUp', () => scroll.scrollUp(pageSize), enabled);
  useShortcut('pageDown', () => scroll.scrollDown(pageSize), enabled);
  useShortcut('ctrl+u', () => scroll.scrollUp(pageSize), enabled);
  useShortcut('ctrl+d', () => scroll.scrollDown(pageSize), enabled);
}
