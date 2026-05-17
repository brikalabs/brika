/**
 * Provider for the shared TUI shell context — chrome height, onQuit,
 * and the input-capture refcount. See `useTuiShell` for the contract.
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
  const [chromeHeight, setChromeHeight] = useState(initialChromeHeight);
  const [captureCount, setCaptureCount] = useState(0);

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
    [chromeHeight, onQuit, captureCount, captureInput]
  );

  return <TuiShellContext.Provider value={value}>{children}</TuiShellContext.Provider>;
}
