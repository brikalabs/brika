import type { ThemeConfig, ThemeMode } from '@brika/clay/themes';
import {
  applyTheme,
  BUILT_IN_THEMES,
  BUILT_IN_THEMES_BY_ID,
  resetThemeVars,
} from '@brika/clay/themes';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'clay-theme';
const URL_PARAM = 'theme';
const MODE_STORAGE_KEY = 'clay-mode';

type ClayMode = 'light' | 'dark';

function readInitialThemeId(): string {
  if (typeof window === 'undefined') {
    return 'default';
  }
  const fromUrl = new URL(window.location.href).searchParams.get(URL_PARAM);
  if (fromUrl && BUILT_IN_THEMES_BY_ID[fromUrl]) {
    return fromUrl;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && BUILT_IN_THEMES_BY_ID[stored]) {
    return stored;
  }
  return 'default';
}

function readInitialMode(): ClayMode {
  if (typeof document === 'undefined') {
    return 'light';
  }
  return document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
}

function toThemeMode(mode: ClayMode): ThemeMode {
  return mode;
}

/**
 * Header dropdown that applies one of Clay's first-party themes site-wide
 * (write CSS vars onto `<html>`), persists the choice to localStorage, and
 * syncs to the URL query string so shared links like `?theme=nord` open
 * with the same palette.
 *
 * Also listens to the `data-mode` attribute toggle from ThemeToggle so the
 * applied theme switches light/dark alongside the docs chrome.
 */
export function ThemePicker() {
  const [themeId, setThemeId] = useState<string>('default');
  const [mode, setMode] = useState<ClayMode>('light');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initialId = readInitialThemeId();
    const initialMode = readInitialMode();
    setThemeId(initialId);
    setMode(initialMode);
    setMounted(true);

    const chosen = BUILT_IN_THEMES_BY_ID[initialId];
    if (chosen && initialId !== 'default') {
      applyTheme(chosen, toThemeMode(initialMode));
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const chosen = BUILT_IN_THEMES_BY_ID[themeId];
    if (!chosen) {
      return;
    }
    if (themeId === 'default') {
      resetThemeVars(chosen);
      return;
    }
    applyTheme(chosen, toThemeMode(mode));
  }, [themeId, mode, mounted]);

  useEffect(() => {
    const onModeChange = () => {
      setMode(document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light');
    };
    const observer = new MutationObserver(onModeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });
    // Also follow cross-tab mode changes.
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY) {
        onModeChange();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocumentClick);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('mousedown', onDocumentClick);
      window.removeEventListener('keydown', onKeydown);
    };
  }, [open]);

  const select = (theme: ThemeConfig) => {
    setThemeId(theme.id);
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // Storage unavailable — in-memory only.
    }
    const url = new URL(window.location.href);
    if (theme.id === 'default') {
      url.searchParams.delete(URL_PARAM);
    } else {
      url.searchParams.set(URL_PARAM, theme.id);
    }
    window.history.replaceState({}, '', url.toString());
  };

  const activeTheme = BUILT_IN_THEMES_BY_ID[themeId] ?? BUILT_IN_THEMES[0];
  const activeLabel = mounted && activeTheme ? activeTheme.name : 'Theme';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={mounted && activeTheme ? `Theme: ${activeTheme.name}` : 'Select theme'}
        className="inline-flex h-8 items-center gap-1.5 rounded px-2 font-mono text-clay-subtle text-xs transition-colors hover:bg-clay-control hover:text-clay-default"
      >
        <Palette size={13} aria-hidden="true" />
        <span className="hidden sm:inline">{activeLabel.toLowerCase()}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated shadow-lg"
        >
          <div className="max-h-[70vh] overflow-y-auto py-1">
            {BUILT_IN_THEMES.map((theme) => {
              const active = theme.id === themeId;
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="menuitem"
                  onClick={() => select(theme)}
                  className={
                    active
                      ? 'flex w-full items-center gap-3 bg-clay-control px-3 py-2 text-left'
                      : 'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-clay-control'
                  }
                >
                  <span
                    className="flex shrink-0 gap-0.5 overflow-hidden rounded border border-clay-hairline"
                    aria-hidden="true"
                  >
                    {theme.accentSwatches.slice(0, 4).map((swatch, index) => (
                      <span
                        key={`${theme.id}-swatch-${index}`}
                        className="block h-4 w-2"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-clay-strong text-sm">{theme.name}</span>
                    <span className="block truncate text-clay-subtle text-xs">
                      {theme.description}
                    </span>
                  </span>
                  {active && (
                    <Check size={14} className="shrink-0 text-clay-brand" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
