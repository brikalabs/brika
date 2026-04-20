import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { ThemeContext, type ThemeMode, type ThemeName } from './theme-context';
import { withCircleWipe } from './view-transition';

const THEME_STORAGE_KEY = 'brika-theme';
const MODE_STORAGE_KEY = 'brika-mode';

function applyThemeToDOM(theme: ThemeName, resolvedMode: 'light' | 'dark') {
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.remove('light', 'dark');
  html.classList.add(resolvedMode);
  html.style.colorScheme = resolvedMode;
}

function useSystemTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    () => 'light'
  );
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const systemTheme = useSystemTheme();

  const [theme, setThemeState] = useState<ThemeName>(() => {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (
      s === 'default' ||
      s === 'ocean' ||
      s === 'forest' ||
      s === 'sunset' ||
      s === 'lavender' ||
      s === 'ruby'
    ) {
      return s;
    }
    return 'default';
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const s = localStorage.getItem(MODE_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') {
      return s;
    }
    return 'system';
  });

  const resolvedMode = mode === 'system' ? systemTheme : mode;

  // Fallback for system-preference changes and initial mount.
  useEffect(() => {
    applyThemeToDOM(theme, resolvedMode);
  }, [theme, resolvedMode]);

  const setTheme = useCallback(
    (newTheme: ThemeName, origin?: Element | null) => {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      withCircleWipe(() => {
        applyThemeToDOM(newTheme, resolvedMode);
        setThemeState(newTheme);
      }, origin);
    },
    [resolvedMode]
  );

  const setMode = useCallback(
    (newMode: ThemeMode, event?: MouseEvent<HTMLElement>) => {
      const next = newMode === 'system' ? systemTheme : newMode;
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
      withCircleWipe(() => {
        applyThemeToDOM(theme, next);
        setModeState(newMode);
      }, event?.currentTarget);
    },
    [systemTheme, theme]
  );

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, setTheme, setMode }),
    [theme, mode, resolvedMode, setTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
