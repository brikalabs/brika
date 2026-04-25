import type { ThemeConfig, ThemeMode } from '@brika/clay/themes';
import {
  applyTheme,
  BUILT_IN_THEMES,
  BUILT_IN_THEMES_BY_ID,
  resetThemeVars,
} from '@brika/clay/themes';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'clay-theme';
const MODE_STORAGE_KEY = 'clay-mode';
const THEME_EVENT = 'clay:theme-change';

type ClayMode = 'light' | 'dark';

function readInitialThemeId(): string {
  if (typeof window === 'undefined') {
    return 'default';
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

const SERIF = '"Instrument Serif", "Iowan Old Style", Georgia, "Times New Roman", serif';

interface SwatchStripProps {
  readonly theme: ThemeConfig;
  readonly count?: number;
  readonly height?: number;
}

function SwatchStrip({ theme, count = 4, height = 14 }: SwatchStripProps) {
  return (
    <span
      className="flex shrink-0 overflow-hidden rounded-sm"
      aria-hidden="true"
      style={{ height }}
    >
      {theme.accentSwatches.slice(0, count).map((swatch, index) => (
        <span
          key={`${theme.id}-swatch-${index}-${swatch}`}
          className="block w-2"
          style={{ backgroundColor: swatch }}
        />
      ))}
    </span>
  );
}

/**
 * Header dropdown that applies one of Clay's first-party themes site-wide
 * (writes CSS vars onto `<html>`) and persists the choice to localStorage.
 * Also follows the data-mode attribute toggle.
 *
 * Trigger: a horizontal swatch strip + serif italic theme name + caret.
 * Dropdown rows: a wide swatch strip on top, serif italic theme name with
 * a mono description, hairline-left active rail.
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
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY) {
        onModeChange();
      } else if (event.key === STORAGE_KEY && event.newValue) {
        setThemeId(event.newValue);
      }
    };
    const onThemeChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setThemeId(event.detail);
      }
    };
    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener(THEME_EVENT, onThemeChange);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener('storage', onStorage);
      globalThis.removeEventListener(THEME_EVENT, onThemeChange);
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
    globalThis.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme.id }));
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
        className="group inline-flex h-8 items-center gap-2 rounded-md border border-clay-hairline bg-clay-elevated pr-1.5 pl-1.5 transition-colors hover:border-clay-default hover:bg-clay-base"
      >
        {mounted && activeTheme && <SwatchStrip theme={activeTheme} count={4} height={16} />}
        <span
          className="text-clay-strong text-sm leading-none"
          style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            letterSpacing: '-0.018em',
          }}
        >
          {activeLabel.toLowerCase()}
        </span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`text-clay-subtle transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-2 w-72 overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated shadow-xl"
        >
          <div className="flex items-center gap-2 border-clay-hairline border-b bg-clay-canvas/40 px-3 py-2">
            <span className="font-medium font-mono text-[0.6875rem] text-clay-subtle uppercase tracking-[0.12em]">
              Theme
            </span>
            <span className="block h-px flex-1 bg-clay-hairline" />
            <span className="font-mono text-[0.625rem] text-clay-inactive">
              {BUILT_IN_THEMES.length} presets
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto py-1.5">
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
                      ? 'flex w-full items-start gap-3 border-clay-strong border-l bg-clay-control/40 px-3 py-2.5 text-left'
                      : 'flex w-full items-start gap-3 border-transparent border-l px-3 py-2.5 text-left transition-colors hover:border-clay-hairline hover:bg-clay-base'
                  }
                >
                  <SwatchStrip theme={theme} count={6} height={28} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className="block text-base text-clay-strong leading-tight"
                      style={{
                        fontFamily: SERIF,
                        fontStyle: 'italic',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {theme.name}
                    </span>
                    <span className="block truncate font-mono text-[0.6875rem] text-clay-subtle leading-snug">
                      {theme.description}
                    </span>
                  </span>
                  {active && (
                    <span className="ml-auto flex shrink-0 items-center font-mono text-[0.625rem] text-clay-strong uppercase tracking-[0.12em]">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-clay-hairline border-t bg-clay-canvas/40 px-3 py-2 font-mono text-[0.625rem] text-clay-inactive">
            Each theme writes its colours onto{' '}
            <code className="rounded border border-clay-hairline bg-clay-base px-1 py-px text-clay-default">
              :root
            </code>{' '}
            as CSS vars.
          </div>
        </div>
      )}
    </div>
  );
}
