import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { injectAllCustomThemes } from '@/features/theme-builder/runtime';
import { customThemeStorage } from '@/features/theme-builder/storage';
import { ThemeContext, type ThemeMode, type ThemeName } from './theme-context';
import { withCircleWipe } from './view-transition';

export { customThemeSelector } from '@/features/theme-builder/runtime';

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

function resolveInitialTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (!stored) {
    return 'default';
  }
  // Custom themes are prefixed with `custom-`; validate it still exists.
  if (stored.startsWith('custom-')) {
    const id = stored.slice('custom-'.length);
    return customThemeStorage.get(id) ? stored : 'default';
  }
  return stored;
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const systemTheme = useSystemTheme();

  const [theme, setThemeState] = useState<ThemeName>(resolveInitialTheme);

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const s = localStorage.getItem(MODE_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') {
      return s;
    }
    return 'system';
  });

  const resolvedMode = mode === 'system' ? systemTheme : mode;

  // Re-inject all custom themes whenever storage changes so newly created
  // or edited themes become selectable without a reload.
  useEffect(() => {
    const sync = () => injectAllCustomThemes(customThemeStorage.list());
    sync();
    return customThemeStorage.subscribe(sync);
  }, []);

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
