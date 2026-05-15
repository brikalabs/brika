/**
 * `useDebug()` — subscribes to the engine's shared debug stream.
 *
 *   const { isOpen, open, push } = useDebug();
 *   push('info', 'plugin loaded', 'pluginHost');
 *
 * Reads context populated by `<DebugProvider>`. Throws when called
 * outside one — the provider is opt-in at the engine level, so
 * consumers that may run without it should check via `tryUseDebug()`.
 */

import { createContext, useContext } from 'react';
import type { DebugContextValue } from './types';

export const DebugContext = createContext<DebugContextValue | null>(null);

export function useDebug(): DebugContextValue {
  const ctx = useContext(DebugContext);
  if (!ctx) {
    throw new Error('useDebug() called outside <DebugProvider>');
  }
  return ctx;
}

/** Variant that returns `null` when no provider is mounted. Useful for
 *  primitives that want to surface their own diagnostic entries when
 *  debug is enabled, without forcing every app to mount the provider. */
export function tryUseDebug(): DebugContextValue | null {
  return useContext(DebugContext);
}
