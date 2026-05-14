/**
 * Consumer hook for the shared TUI state context. Every screen pulls
 * what it needs from this — supervisor, focused service, scroll,
 * search, toast, layout, exit. Throws a hard error when used outside
 * `<MortarProvider>` so misconfiguration surfaces immediately.
 */

import { createContext, useContext } from 'react';
import type { ServiceState, Supervisor } from '../supervisor';
import type { FocusedServiceControls } from './state/useFocusedService';
import type { FullscreenControls } from './state/useFullscreen';
import type { LayoutDimensions } from './state/useLayoutDimensions';
import type { ScrollControls } from './state/useScroll';
import type { SearchControls } from './state/useSearch';
import type { ToastControls } from './state/useToast';

export interface MortarState {
  readonly supervisor: Supervisor;
  readonly services: ReadonlyArray<ServiceState>;
  readonly focus: FocusedServiceControls;
  readonly scroll: ScrollControls;
  readonly search: SearchControls;
  readonly toast: ToastControls;
  readonly layout: LayoutDimensions;
  readonly fullscreen: FullscreenControls;
  /**
   * Push the rendered chrome height (footer + borders) so the log pane
   * gets `rows - chromeHeight` lines instead of the static fallback.
   * Views call this from a `useEffect` after measuring with `useMeasure`.
   */
  readonly setChromeHeight: (height: number) => void;
  /** Trigger graceful shutdown — emits 'shutting-down' via supervisor. */
  readonly onQuit: () => void;
}

export const MortarContext = createContext<MortarState | null>(null);

export function useMortar(): MortarState {
  const ctx = useContext(MortarContext);
  if (!ctx) {
    throw new Error('useMortar() called outside <MortarProvider>');
  }
  return ctx;
}
