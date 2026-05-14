/**
 * Provider for the shared TUI shell context — chrome height + onQuit.
 * See `useTuiShell` for the contract.
 *
 * Wrap your tree like:
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
  const [chromeHeight, setChromeHeightRaw] = useState(initialChromeHeight);

  const setChromeHeight = useCallback((h: number) => {
    setChromeHeightRaw((prev) => (prev === h ? prev : h));
  }, []);

  const value = useMemo<TuiShellState>(
    () => ({ chromeHeight, setChromeHeight, onQuit }),
    [chromeHeight, setChromeHeight, onQuit]
  );

  return <TuiShellContext.Provider value={value}>{children}</TuiShellContext.Provider>;
}
