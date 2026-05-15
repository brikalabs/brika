/**
 * Minimal generic context shared by every `@brika/tui` consumer.
 *
 * Holds three pieces of state that primitives in this package need
 * to talk to but that every TUI app has:
 *
 *   - a measured chrome height (so the log pane can size itself),
 *   - an `onQuit()` sink (so global keybinds know how to leave),
 *   - an input-capture counter (so forms can suspend global keybinds
 *     while they're typing — keystrokes don't leak into hub-control
 *     hotkeys, etc.).
 *
 * Apps wrap their tree with `<TuiShellProvider onQuit={…}>` and layer
 * their own app-specific contexts on top. Forms call
 * `useCaptureInput()` to mute global binds for their lifetime.
 */

import { createContext, useContext, useEffect } from 'react';

export interface TuiShellState {
  /** Lines reserved for chrome (borders, header, footer). */
  readonly chromeHeight: number;
  /** Stable callback — `MeasuredChrome` pushes its measured height through here. */
  readonly setChromeHeight: (height: number) => void;
  /** Trigger app-defined graceful shutdown (q / Ctrl+C handlers call this). */
  readonly onQuit: () => void;
  /**
   * Refcounted "something has focus and wants exclusive input". When
   * non-zero, callers wiring global keybinds should pass `enabled=false`
   * so a form's keystrokes don't double-fire as hub actions, route
   * jumps, etc.
   */
  readonly isInputCaptured: boolean;
  /** Increment the capture counter. Returns a release function. */
  readonly captureInput: () => () => void;
}

export const TuiShellContext = createContext<TuiShellState | null>(null);

export function useTuiShell(): TuiShellState {
  const ctx = useContext(TuiShellContext);
  if (!ctx) {
    throw new Error('useTuiShell() called outside <TuiShellProvider>');
  }
  return ctx;
}

/** Non-throwing variant. Returns `null` when no `<TuiShellProvider>` is
 *  mounted — useful for primitives that *should* integrate with the
 *  shell when available but don't strictly require it (e.g. the engine
 *  debug overlay, which may sit above the shell in the tree). */
export function tryUseTuiShell(): TuiShellState | null {
  return useContext(TuiShellContext);
}

/**
 * Mount-scoped input capture: while the calling component is mounted
 * (and `active` is true), global keybinds wired via `useKey` with
 * `enabled=!isInputCaptured` will suspend.
 *
 * Use from any form / overlay / modal that owns the keyboard:
 *
 *   function MyForm(): React.ReactElement {
 *     useCaptureInput();
 *     return …;
 *   }
 *
 * Pass `active={false}` to temporarily release without unmounting.
 */
export function useCaptureInput(active: boolean = true): void {
  // Soft dependency: if no shell is mounted (e.g. an `<Input>` inside
  // the engine debug overlay sitting above `<TuiShellProvider>`), we
  // simply skip capture — there are no shell-level binds to suspend.
  const shell = tryUseTuiShell();
  const captureInput = shell?.captureInput;
  useEffect(() => {
    if (!active || !captureInput) {
      return;
    }
    const release = captureInput();
    return () => {
      release();
    };
  }, [active, captureInput]);
}
