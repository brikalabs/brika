/**
 * Minimal generic context shared by every `@brika/tui` consumer.
 *
 * Holds three pieces of state that the primitives in this package need
 * to talk to but every TUI app has:
 *
 *   - a measured chrome height (so the log pane can size itself),
 *   - an `onQuit()` sink (so global keybinds know how to leave),
 *   - an input-capture counter (so `<Input>` / `<Confirm>` / `<Form>`
 *     can suspend global keybinds while collecting keystrokes —
 *     `useShortcut` reads it automatically).
 *
 * Apps wrap their tree with `<TuiShellProvider onQuit={…}>` and layer
 * their own app-specific contexts on top. Capturing primitives call
 * `useCaptureInput()` for their mount lifetime.
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
   * non-zero, `useShortcut` calls outside a `<KeyScope>` auto-suspend
   * so global hotkeys (q, [, ], 1-8, …) don't bleed into typing.
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
 *  mounted (e.g. the engine debug overlay sitting above the shell). */
export function useOptionalTuiShell(): TuiShellState | null {
  return useContext(TuiShellContext);
}

/**
 * Mount-scoped input capture: while the calling component is mounted
 * (and `active` is true), `useShortcut` calls outside a `<KeyScope>`
 * auto-suspend.
 *
 *   function MyForm(): React.ReactElement {
 *     useCaptureInput();
 *     return …;
 *   }
 *
 * Pass `active={false}` to temporarily release without unmounting
 * (e.g. an Input that's blurred but still rendered).
 */
export function useCaptureInput(active: boolean = true): void {
  const shell = useOptionalTuiShell();
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
