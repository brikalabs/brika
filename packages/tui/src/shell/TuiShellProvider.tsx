/**
 * Provider for the shared TUI shell context — chrome height, onQuit,
 * and the input-capture counter. See `useTuiShell` for the contract.
 *
 *   <RouterProvider router={router}>
 *     <TuiShellProvider onQuit={onQuit} initialChromeHeight={9}>
 *       <AppStateProvider>
 *         <Outlet />
 *       </AppStateProvider>
 *     </TuiShellProvider>
 *   </RouterProvider>
 *
 * The initial chrome height is a fallback for the first frame; the
 * real height arrives as soon as `<MeasuredChrome>` has rendered once.
 * Input capture is a refcount: forms / overlays bump it via
 * `useCaptureInput()` and global keybinds read `isInputCaptured`.
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { TuiShellContext, type TuiShellState } from './useTuiShell';

export interface TuiShellProviderProps {
  readonly onQuit: () => void;
  /** Fallback chrome height on the first frame, before any `<MeasuredChrome>` has rendered. */
  readonly initialChromeHeight?: number;
  readonly children?: React.ReactNode;
}

export function TuiShellProvider({
  onQuit,
  initialChromeHeight = 9,
  children,
}: Readonly<TuiShellProviderProps>): React.ReactElement {
  const [chromeHeight, setChromeHeightRaw] = useState(initialChromeHeight);
  const [captureCount, setCaptureCount] = useState(0);

  const setChromeHeight = useCallback((h: number) => {
    setChromeHeightRaw((prev) => (prev === h ? prev : h));
  }, []);

  const captureInput = useCallback((): (() => void) => {
    setCaptureCount((n) => n + 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      setCaptureCount((n) => Math.max(0, n - 1));
    };
  }, []);

  const value = useMemo<TuiShellState>(
    () => ({
      chromeHeight,
      setChromeHeight,
      onQuit,
      isInputCaptured: captureCount > 0,
      captureInput,
    }),
    [chromeHeight, setChromeHeight, onQuit, captureCount, captureInput]
  );

  return <TuiShellContext.Provider value={value}>{children}</TuiShellContext.Provider>;
}
