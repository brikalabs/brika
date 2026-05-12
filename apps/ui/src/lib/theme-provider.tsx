import { applyTheme, resetThemeVars } from '@brika/clay/themes';
import { builtInThemesById } from '@brika/clay/themes/registry';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { applyBrikaExtras, resetBrikaExtras } from '@/features/theme-builder/runtime';
import {
  customThemeStorage,
  hydrateCustomThemes,
  migrateLegacyThemes,
} from '@/features/theme-builder/storage';
import type { ThemeConfig } from '@/features/theme-builder/types';
import { fetcher } from '@/lib/query';
import { ThemeContext, type ThemeMode, type ThemeName } from './theme-context';
import { withCircleWipe } from './view-transition';

export { customThemeSelector } from '@/features/theme-builder/runtime';

const THEME_CACHE_KEY = 'brika-theme-cache';
const MODE_CACHE_KEY = 'brika-mode-cache';

const LEGACY_THEME_KEY = 'brika-theme';
const LEGACY_MODE_KEY = 'brika-mode';

interface ApiTheme {
  theme: string | null;
  mode: ThemeMode;
}

function resolveActiveTheme(name: ThemeName): ThemeConfig | null {
  if (name.startsWith('custom-')) {
    return customThemeStorage.get(name.slice('custom-'.length)) ?? null;
  }
  const clay = builtInThemesById[name];
  if (!clay) {
    return null;
  }
  // Wrap Clay's preset with the v2 metadata so downstream code can treat
  // built-in + custom themes uniformly. Clay ignores unknown top-level keys,
  // and `applyBrikaExtras` no-ops when `brika` is undefined.
  return {
    ...clay,
    version: 1 as const,
    createdAt: 0,
    updatedAt: 0,
  };
}

function applyThemeToDOM(name: ThemeName, resolvedMode: 'light' | 'dark') {
  const html = document.documentElement;
  const theme = resolveActiveTheme(name);
  if (theme) {
    applyTheme(theme);
    applyBrikaExtras(theme);
  } else {
    resetThemeVars();
    resetBrikaExtras();
  }
  // `data-theme` is harmless to keep for any debugging that reads it.
  html.dataset.theme = name;
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

function readShadowString(key: string, legacyKey: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
}

/** Brika's signature theme — applied when the user hasn't picked one yet. */
const DEFAULT_THEME: ThemeName = 'brika';

function resolveInitialTheme(): ThemeName {
  const stored = readShadowString(THEME_CACHE_KEY, LEGACY_THEME_KEY);
  if (!stored) {
    return DEFAULT_THEME;
  }
  if (stored.startsWith('custom-')) {
    const id = stored.slice('custom-'.length);
    return customThemeStorage.get(id) ? stored : DEFAULT_THEME;
  }
  return stored;
}

function resolveInitialMode(): ThemeMode {
  const s = readShadowString(MODE_CACHE_KEY, LEGACY_MODE_KEY);
  if (s === 'light' || s === 'dark' || s === 'system') {
    return s;
  }
  return 'system';
}

function cacheTheme(theme: ThemeName) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  }
}

function cacheMode(mode: ThemeMode) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MODE_CACHE_KEY, mode);
  }
}

function clearLegacyKeys() {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(LEGACY_THEME_KEY);
  localStorage.removeItem(LEGACY_MODE_KEY);
}

async function pushThemeToHub(patch: Partial<ApiTheme>): Promise<void> {
  try {
    await fetcher('/api/settings/theme', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.warn('[theme] Failed to persist theme preference to hub', err);
  }
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const systemTheme = useSystemTheme();

  const [theme, setThemeState] = useState<ThemeName>(resolveInitialTheme);
  const [mode, setModeState] = useState<ThemeMode>(resolveInitialMode);
  const bootstrappedRef = useRef(false);

  const resolvedMode = mode === 'system' ? systemTheme : mode;

  // Re-apply when the active custom theme is hydrated from the hub or edited
  // in the builder. Built-in themes don't subscribe — their content is static.
  useEffect(() => {
    if (!theme.startsWith('custom-')) {
      return;
    }
    const sync = () => applyThemeToDOM(theme, resolvedMode);
    return customThemeStorage.subscribe(sync);
  }, [theme, resolvedMode]);

  useEffect(() => {
    applyThemeToDOM(theme, resolvedMode);
  }, [theme, resolvedMode]);

  // Bootstrap: hydrate custom themes, pull active selection from hub,
  // reconcile with shadow cache, migrate legacy keys. Runs once.
  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    let cancelled = false;
    (async () => {
      await hydrateCustomThemes();
      void migrateLegacyThemes();

      try {
        const remote = await fetcher<ApiTheme>('/api/settings/theme');
        if (cancelled) {
          return;
        }
        if (remote.theme && remote.theme !== theme) {
          cacheTheme(remote.theme);
          setThemeState(remote.theme);
        }
        if (remote.mode && remote.mode !== mode) {
          cacheMode(remote.mode);
          setModeState(remote.mode);
        }
        if (!remote.theme) {
          void pushThemeToHub({ theme, mode });
        }
      } catch {
        /* swallowed — cached values already applied */
      } finally {
        clearLegacyKeys();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, theme]);

  useEffect(() => {
    const source = new EventSource('/api/stream/events', { withCredentials: true });
    const handler = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type?.startsWith('theme.')) {
          void hydrateCustomThemes();
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    source.addEventListener('event', handler);
    return () => {
      source.removeEventListener('event', handler);
      source.close();
    };
  }, []);

  const setTheme = useCallback(
    (newTheme: ThemeName, origin?: Element | null) => {
      cacheTheme(newTheme);
      withCircleWipe(() => {
        applyThemeToDOM(newTheme, resolvedMode);
        setThemeState(newTheme);
      }, origin);
      void pushThemeToHub({ theme: newTheme });
    },
    [resolvedMode]
  );

  const setMode = useCallback(
    (newMode: ThemeMode, event?: MouseEvent<HTMLElement>) => {
      const next = newMode === 'system' ? systemTheme : newMode;
      cacheMode(newMode);
      withCircleWipe(() => {
        applyThemeToDOM(theme, next);
        setModeState(newMode);
      }, event?.currentTarget);
      void pushThemeToHub({ mode: newMode });
    },
    [systemTheme, theme]
  );

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, setTheme, setMode }),
    [theme, mode, resolvedMode, setTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
