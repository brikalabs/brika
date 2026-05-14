/**
 * Pure scroll-math helpers shared by `useScroll` and the views.
 * No React, no ink — just integer arithmetic.
 */

export function clampScroll(value: number, max: number): number {
  if (value <= 0) {
    return 0;
  }
  return Math.min(value, max);
}

/** Returns the new scroll offset after scrolling down `by` lines. */
export function scrollDownBy(current: number | null, by: number): number | null {
  if (current === null) {
    return null;
  }
  const next = current - by;
  return next <= 0 ? null : next;
}

/**
 * Resolve the scroll offset for the log pane. When a search match is
 * active, the offset is derived so the match sits in the middle of the
 * visible window; otherwise the user's manual scroll position is used
 * (or `null` for live-tail).
 */
export function effectiveScrollOffset(
  manualOffset: number | null,
  matchLine: number | null,
  totalLines: number,
  visible: number,
  maxScroll: number
): number | null {
  if (matchLine === null) {
    return manualOffset;
  }
  return clampScroll(totalLines - matchLine - Math.floor(visible / 2), maxScroll);
}
