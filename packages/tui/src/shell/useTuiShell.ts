/**
 * Minimal generic context shared by every `@brika/tui` consumer.
 *
 * Holds the two pieces of state that primitives in this package need
 * to talk to but that *every* TUI app has: a measured chrome height
 * (so the log pane can size itself) and an `onQuit()` sink (so global
 * keybinds know how to leave).
 *
 * Apps wrap their tree with `<TuiShellProvider onQuit={…}>` and layer
 * their own app-specific contexts on top (mortar has `<MortarProvider>`,
 * brika-cli has `<CliProvider>`).
 */

import { createContext, useContext } from 'react';

export interface TuiShellState {
  /** Lines reserved for chrome (borders, header, footer). */
  readonly chromeHeight: number;
  /** Stable callback — `MeasuredChrome` pushes its measured height through here. */
  readonly setChromeHeight: (height: number) => void;
  /** Trigger app-defined graceful shutdown (q / Ctrl+C handlers call this). */
  readonly onQuit: () => void;
}

export const TuiShellContext = createContext<TuiShellState | null>(null);

export function useTuiShell(): TuiShellState {
  const ctx = useContext(TuiShellContext);
  if (!ctx) {
    throw new Error('useTuiShell() called outside <TuiShellProvider>');
  }
  return ctx;
}
