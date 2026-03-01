import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { ThemeContext, type ThemeMode, type ThemeName } from './theme-context';

const THEME_STORAGE_KEY = 'brika-theme';
const MODE_STORAGE_KEY = 'brika-mode';

function useSystemTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (callback) => {
      const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    },
    () => (globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    () => 'light'
  );
}

export function ThemeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const systemTheme = useSystemTheme();

  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (
      stored === 'default' ||
      stored === 'ocean' ||
      stored === 'forest' ||
      stored === 'sunset' ||
      stored === 'lavender' ||
      stored === 'ruby'
    ) {
      return stored;
    }
    return 'default';
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const resolvedMode = mode === 'system' ? systemTheme : mode;

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme;
    html.classList.remove('light', 'dark');
    html.classList.add(resolvedMode);
  }, [
    theme,
    resolvedMode,
  ]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      mode,
      resolvedMode,
      setTheme,
      setMode,
    }),
    [
      theme,
      mode,
      resolvedMode,
      setTheme,
      setMode,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
