/**
 * Composes mortar's domain-specific TUI state into one context value.
 *
 * Generic shell concerns — chrome height + onQuit — live in
 * `<TuiShellProvider>` (from `@brika/tui`) which MUST wrap this
 * provider. We read chrome height from `useTuiShell()` so the log
 * pane can size against it.
 *
 * Must also be rendered INSIDE `<RouterProvider>` so `useShutdownBridge`
 * can read the router via `useRouter()` instead of taking it as a prop.
 */

import {
  useFullscreen,
  useLayoutDimensions,
  useScroll,
  useSearch,
  useToast,
  useTuiShell,
} from '@brika/tui';
import type React from 'react';
import { useMemo } from 'react';
import type { Supervisor } from '../supervisor';
import { useFocusedService } from './state/useFocusedService';
import { useShutdownBridge } from './state/useShutdownBridge';
import { useSupervisorTick } from './state/useSupervisorTick';
import { MortarContext, type MortarState } from './useMortar';

export interface MortarProviderProps {
  readonly supervisor: Supervisor;
  readonly children?: React.ReactNode;
}

export function MortarProvider({
  supervisor,
  children,
}: Readonly<MortarProviderProps>): React.ReactElement {
  useSupervisorTick(supervisor);
  useShutdownBridge(supervisor);

  const services = supervisor.list();
  const focus = useFocusedService(services);
  const focusedLogs = focus.focused?.logs ?? [];

  // Shell context provides the measured chrome height — the log pane
  // sizes against it. State survives route changes because it lives
  // one level up (`<TuiShellProvider>`).
  const { chromeHeight } = useTuiShell();

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
    }),
    [supervisor, services, focus, scroll, search, toast, layout, fullscreen]
  );

  return <MortarContext.Provider value={value}>{children}</MortarContext.Provider>;
}
