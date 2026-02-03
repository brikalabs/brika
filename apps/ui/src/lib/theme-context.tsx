import { createContext, useContext } from 'react';

export type ThemeName = 'default' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'ruby';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
