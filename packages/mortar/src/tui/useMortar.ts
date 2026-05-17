/**
 * Consumer hook for mortar's domain TUI state context. Screens pull
 * what they need from this — supervisor, focused service, scroll,
 * search, toast, layout, fullscreen.
 *
 * Generic shell state (chrome height, onQuit) is NOT here — read it
 * from `useTuiShell()` in `@brika/tui` instead.
 *
 * Throws a hard error when used outside `<MortarProvider>` so
 * misconfiguration surfaces immediately.
 */

import type {
  FullscreenControls,
  LayoutDimensions,
  ScrollControls,
  SearchControls,
  ToastControls,
} from '@brika/tui';
import { createContext, useContext } from 'react';
import type { ServiceState, Supervisor } from '../supervisor';
import type { FocusedServiceControls } from './state/useFocusedService';

export interface MortarState {
  readonly supervisor: Supervisor;
  readonly services: ReadonlyArray<ServiceState>;
  readonly focus: FocusedServiceControls;
  readonly scroll: ScrollControls;
  readonly search: SearchControls;
  readonly toast: ToastControls;
  readonly layout: LayoutDimensions;
  readonly fullscreen: FullscreenControls;
}

export const MortarContext = createContext<MortarState | null>(null);

export function useMortar(): MortarState {
  const ctx = useContext(MortarContext);
  if (!ctx) {
    throw new Error('useMortar() called outside <MortarProvider>');
  }
  return ctx;
}
