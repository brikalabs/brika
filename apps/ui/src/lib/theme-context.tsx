import { BUILT_IN_THEMES as CLAY_THEMES } from '@brika/clay/themes';
import type { MouseEvent } from 'react';
import { createContext, useContext } from 'react';

/**
 * Every theme id Clay ships, in registry order. Pulled directly from
 * `@brika/clay/themes` so adding a new theme to Clay automatically
 * surfaces it in the Brika theme selector — no second list to maintain.
 */
export const BUILT_IN_THEMES: readonly string[] = CLAY_THEMES.map((t) => t.id);

/**
 * Theme name: a built-in name, or `custom-{id}` for a user-created theme
 * loaded via the theme-builder. We keep the type as a plain string so
 * arbitrary custom ids are allowed; a `isBuiltInTheme` guard is exported
 * for cases that need to discriminate.
 */
export type ThemeName = string;

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  setTheme: (theme: ThemeName, origin?: Element | null) => void;
  setMode: (mode: ThemeMode, event?: MouseEvent<HTMLElement>) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export function isBuiltInTheme(name: string): boolean {
  return BUILT_IN_THEMES.includes(name);
}
