/**
 * React hooks for reading custom themes.
 *
 * `useCustomThemes()` subscribes to the storage layer via useSyncExternalStore,
 * so every consumer stays in sync when a theme is added, edited, or removed
 * in another tab or another component.
 */

import { useSyncExternalStore } from 'react';
import { customThemeStorage } from './storage';
import type { ThemeConfig } from './types';

export function useCustomThemes(): ThemeConfig[] {
  return useSyncExternalStore(
    (cb) => customThemeStorage.subscribe(cb),
    () => customThemeStorage.list(),
    () => []
  );
}

export function useCustomTheme(id: string | undefined): ThemeConfig | undefined {
  const all = useCustomThemes();
  return id ? all.find((t) => t.id === id) : undefined;
}
