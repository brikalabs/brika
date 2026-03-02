import type { MouseEvent } from 'react';
import { createContext, useContext } from 'react';

export type ThemeName = 'default' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'ruby';
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
