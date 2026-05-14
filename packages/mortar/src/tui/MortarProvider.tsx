/**
 * Composes every state hook into one context value. Order matters
 * only inside this component — consumers see a flat record.
 *
 * Must be rendered INSIDE `<RouterProvider>` so `useShutdownBridge`
 * can read the router via `useRouter()` instead of taking it as a prop.
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { TUI_CHROME_LINES } from '../constants';
import type { Supervisor } from '../supervisor';
import { useFocusedService } from './state/useFocusedService';
import { useFullscreen } from './state/useFullscreen';
import { useLayoutDimensions } from './state/useLayoutDimensions';
import { useScroll } from './state/useScroll';
import { useSearch } from './state/useSearch';
import { useShutdownBridge } from './state/useShutdownBridge';
import { useSupervisorTick } from './state/useSupervisorTick';
import { useToast } from './state/useToast';
import { MortarContext, type MortarState } from './useMortar';

export interface MortarProviderProps {
  readonly supervisor: Supervisor;
  readonly onQuit: () => void;
  readonly children?: React.ReactNode;
}

export function MortarProvider({
  supervisor,
  onQuit,
  children,
}: Readonly<MortarProviderProps>): React.ReactElement {
  useSupervisorTick(supervisor);
  useShutdownBridge(supervisor);

  const services = supervisor.list();
  const focus = useFocusedService(services);
  const focusedLogs = focus.focused?.logs ?? [];

  // Views push their measured chrome height here; until they do, fall
  // back to the constant. State lives in the provider so a route change
  // doesn't lose the measurement between unmount/mount cycles of views
  // that share the same chrome (Main + Input).
  const [chromeHeight, setChromeHeight] = useState(TUI_CHROME_LINES);
  const setChromeHeightStable = useCallback((h: number) => {
    setChromeHeight((prev) => (prev === h ? prev : h));
  }, []);

  const layout = useLayoutDimensions(focusedLogs.length, chromeHeight);
  const scroll = useScroll(layout.maxScroll);
  const search = useSearch(focusedLogs, focus.focused?.spec.id ?? '');
  const toast = useToast();
  const fullscreen = useFullscreen();

  const value = useMemo<MortarState>(
    () => ({
      supervisor,
      services,
      focus,
      scroll,
      search,
      toast,
      layout,
      fullscreen,
      setChromeHeight: setChromeHeightStable,
      onQuit,
    }),
    [
      supervisor,
      services,
      focus,
      scroll,
      search,
      toast,
      layout,
      fullscreen,
      setChromeHeightStable,
      onQuit,
    ]
  );

  return <MortarContext.Provider value={value}>{children}</MortarContext.Provider>;
}
