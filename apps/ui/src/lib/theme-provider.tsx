import { applyTheme, BUILT_IN_THEMES_BY_ID, resetThemeVars } from '@brika/clay/themes';
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
import { injectActiveCustomTheme, injectAllCustomThemes } from '@/features/theme-builder/runtime';
import {
  customThemeStorage,
  hydrateCustomThemes,
  migrateLegacyThemes,
} from '@/features/theme-builder/storage';
import { fetcher } from '@/lib/query';
import { ThemeContext, type ThemeMode, type ThemeName } from './theme-context';
import { withCircleWipe } from './view-transition';

export { customThemeSelector } from '@/features/theme-builder/runtime';

// Shadow cache keys — persist the last-known-good selection so the first
// render after a reload paints the correct theme before the hub responds.
const THEME_CACHE_KEY = 'brika-theme-cache';
const MODE_CACHE_KEY = 'brika-mode-cache';

// Legacy keys, only read during a one-time migration to the shadow.
const LEGACY_THEME_KEY = 'brika-theme';
const LEGACY_MODE_KEY = 'brika-mode';

interface ApiTheme {
  theme: string | null;
  mode: ThemeMode;
}

function applyThemeToDOM(theme: ThemeName, resolvedMode: 'light' | 'dark') {
  const html = document.documentElement;
  // Custom themes inject their own `[data-theme="custom-{id}"]` block via
  // the theme-builder runtime; built-in themes route through clay's
  // `<style id="clay-theme">` tag.
  if (theme.startsWith('custom-')) {
    resetThemeVars();
  } else {
    const preset = BUILT_IN_THEMES_BY_ID[theme];
    if (preset) {
      applyTheme(preset);
    } else {
      resetThemeVars();
    }
  }
  // The `data-theme` attribute is still required for custom themes (their
  // CSS is scoped by `[data-theme="custom-{id}"]`). Built-in themes don't
  // key off it but harmless to keep, and useful for any debugging that
  // reads `documentElement.dataset.theme`.
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

function readShadowString(key: string, legacyKey: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
}

function resolveInitialTheme(): ThemeName {
  const stored = readShadowString(THEME_CACHE_KEY, LEGACY_THEME_KEY);
  if (!stored) {
    return 'default';
  }
  if (stored.startsWith('custom-')) {
    const id = stored.slice('custom-'.length);
    return customThemeStorage.get(id) ? stored : 'default';
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

  // Inject only the active custom theme at boot — a user who isn't
  // currently using one shouldn't pay for every theme they've ever saved.
  // The builder page owns `injectAllCustomThemes` for its thumbnail row.
  useEffect(() => {
    if (theme.startsWith('custom-')) {
      injectActiveCustomTheme(theme.slice('custom-'.length));
    }
  }, [theme]);

  // Keep the active theme's <style> tag in sync with external edits
  // (e.g., another tab). The builder refreshes all tags itself; here we
  // only need to refresh the one that's currently applied.
  useEffect(() => {
    const sync = () => {
      if (theme.startsWith('custom-')) {
        injectActiveCustomTheme(theme.slice('custom-'.length));
      } else {
        injectAllCustomThemes(customThemeStorage.list());
      }
    };
    return customThemeStorage.subscribe(sync);
  }, [theme]);

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
        // If the hub has no preference yet, push the current shadow as the
        // seed. Covers the "fresh login, existing localStorage" case.
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

  // Listen for custom-theme invalidations broadcast by other tabs /
  // devices. Reusing `/api/stream/events` avoids spinning up a dedicated
  // channel for a single event type.
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
