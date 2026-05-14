/**
 * Derive log-pane dimensions from the live terminal size and the
 * focused service's log buffer length. Reacts to terminal resizes.
 *
 * `chromeHeight` is the vertical space outside the log pane (footer,
 * borders, headers). Views measure their own chrome via {@link useMeasure}
 * and push that number back through `MortarProvider`; until a measurement
 * arrives, the {@link TUI_CHROME_LINES} fallback is used.
 */

import { TUI_CHROME_LINES, TUI_MIN_VISIBLE_LINES } from '../../constants';
import { useTerminalSize } from './useTerminalSize';

export interface LayoutDimensions {
  /** Lines available in the log pane (clamped to >= TUI_MIN_VISIBLE_LINES). */
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
  chromeHeight: number = TUI_CHROME_LINES
): LayoutDimensions {
  const { columns, rows } = useTerminalSize();
  const visible = Math.max(TUI_MIN_VISIBLE_LINES, rows - chromeHeight);
  return {
    visible,
    pageSize: Math.max(1, Math.floor(visible / 2)),
    maxScroll: Math.max(0, totalLogs - visible),
    columns,
    rows,
  };
}
