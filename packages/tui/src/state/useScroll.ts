/**
 * Log-pane scroll position. `offset === null` means "live-tail" — the
 * pane auto-scrolls as new lines arrive. Any non-null value is "lines
 * above the tail", clamped to `[0, maxScroll]`.
 */

import { useMemo, useState } from 'react';
import { clampScroll, scrollDownBy } from '../utils/scroll';

export interface ScrollControls {
  /** Lines above the tail; `null` = live-tail (auto-scroll on new lines). */
  readonly offset: number | null;
  readonly scrollUp: (lines: number) => void;
  readonly scrollDown: (lines: number) => void;
  readonly goTop: () => void;
  readonly goLive: () => void;
}

export function useScroll(maxScroll: number): ScrollControls {
  const [offset, setOffset] = useState<number | null>(null);
  return useMemo(
    () => ({
      offset,
      scrollUp: (lines) => setOffset((s) => clampScroll((s ?? 0) + lines, maxScroll)),
      scrollDown: (lines) => setOffset((s) => scrollDownBy(s, lines)),
      goTop: () => setOffset(maxScroll),
      goLive: () => setOffset(null),
    }),
    [offset, maxScroll]
  );
}
