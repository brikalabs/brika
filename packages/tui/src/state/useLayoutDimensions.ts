/**
 * Derive log-pane dimensions from the live terminal size and the log
 * buffer length. Reacts to terminal resizes.
 *
 * `chromeHeight` is the vertical space outside the log pane (footer,
 * borders, headers). Views measure their own chrome via {@link useMeasure}
 * and push that number back through `<TuiShellProvider>`; until a
 * measurement arrives the fallback (9 lines) is used.
 */

import { useTerminalSize } from './useTerminalSize';

/** Minimum visible-lines for the log pane even on a tiny terminal. */
const MIN_VISIBLE_LINES = 5;
/** Default chrome reservation when no measurement has arrived yet. */
const DEFAULT_CHROME_LINES = 9;

export interface LayoutDimensions {
  /** Lines available in the log pane (clamped to >= MIN_VISIBLE_LINES). */
  readonly visible: number;
  /** Half-window for PgUp / PgDn. */
  readonly pageSize: number;
  /** Max scroll offset (0 when logs fit in `visible`). */
  readonly maxScroll: number;
  /** Live terminal size — exposed so views can size their own boxes. */
  readonly columns: number;
  readonly rows: number;
}

export function useLayoutDimensions(
  totalLogs: number,
  chromeHeight: number = DEFAULT_CHROME_LINES
): LayoutDimensions {
  const { columns, rows } = useTerminalSize();
  const visible = Math.max(MIN_VISIBLE_LINES, rows - chromeHeight);
  return {
    visible,
    pageSize: Math.max(1, Math.floor(visible / 2)),
    maxScroll: Math.max(0, totalLogs - visible),
    columns,
    rows,
  };
}
