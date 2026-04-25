import { Button } from '@brika/clay/components/button';
import type { ThemeConfig, ThemeMode } from '@brika/clay/themes';
import { BUILT_IN_THEMES, themeToCssVars } from '@brika/clay/themes';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'clay-theme';
const THEME_EVENT = 'clay:theme-change';
const SERIF = '"Instrument Serif", "Iowan Old Style", Georgia, "Times New Roman", serif';

function readActiveThemeId(): string {
  if (typeof localStorage === 'undefined') {
    return 'default';
  }
  return localStorage.getItem(STORAGE_KEY) ?? 'default';
}

function readActiveMode(): ThemeMode {
  if (typeof document === 'undefined') {
    return 'light';
  }
  return document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

interface ThemeCardProps {
  readonly theme: ThemeConfig;
  readonly index: number;
  readonly active: boolean;
  readonly mode: ThemeMode;
  readonly onSelect: (theme: ThemeConfig) => void;
}

/**
 * One theme card — a single themed pane (theme.background fills the body)
 * with the theme's own typography colors. Active state is communicated by
 * an outer ring drawn outside the themed surface in chrome colors so it
 * stays legible regardless of palette.
 *
 * The internal layout is a rigid CSS grid. Every row except the body
 * specimen has a fixed size, the body row is `1fr`, and the parent grid
 * uses `auto-rows-fr` — so every card in a row aligns exactly.
 */
function ThemeCard({ theme, index, active, mode, onSelect }: ThemeCardProps) {
  const scope = themeToCssVars(theme, mode);
  const palette = theme.colors[mode];
  const wrapperClass = active
    ? 'group relative h-full rounded-lg ring-1 ring-clay-strong ring-offset-2 ring-offset-clay-canvas transition-all'
    : 'group relative h-full rounded-lg ring-1 ring-clay-hairline transition-all hover:ring-clay-default';

  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      aria-pressed={active}
      className={wrapperClass}
    >
      <div
        style={{
          ...scope,
          backgroundColor: palette.background,
          color: palette.foreground,
          borderColor: palette.border,
        }}
        className="grid h-full w-full grid-rows-[auto_1fr_auto_auto] gap-0 overflow-hidden rounded-lg border text-left"
      >
        {/* Row 1 — drafting strip in theme's muted tone */}
        <div
          className="flex h-9 items-center gap-2 border-b px-4 font-medium font-mono text-[0.625rem] uppercase tracking-[0.14em]"
          style={{ borderColor: palette.border, color: palette['muted-foreground'] }}
        >
          <span>№ {pad(index + 1)}</span>
          <span
            aria-hidden="true"
            className="block h-px w-3"
            style={{ backgroundColor: palette.border }}
          />
          <span className="truncate">{theme.id}</span>
          <span
            aria-hidden="true"
            className="block h-px flex-1"
            style={{ backgroundColor: palette.border }}
          />
          <span style={{ color: active ? palette.foreground : palette['muted-foreground'] }}>
            {active ? 'Active' : 'Apply'}
          </span>
        </div>

        {/* Row 2 — specimen body. Big italic name + description + accent line */}
        <div className="flex flex-col justify-between gap-6 px-6 pt-6 pb-5">
          <div>
            <h3
              className="block text-5xl leading-none"
              style={{
                fontFamily: SERIF,
                fontStyle: 'italic',
                letterSpacing: '-0.022em',
                color: palette.foreground,
              }}
            >
              {theme.name}
            </h3>
            <p
              className="mt-3 line-clamp-2 min-h-[2lh] text-[0.8125rem] leading-snug"
              style={{ color: palette['muted-foreground'] }}
            >
              {theme.description}
            </p>
          </div>

          {/* A single Button + a hairline accent — minimal, theme-aware */}
          <div className="flex items-center gap-3">
            <Button size="sm">Sample</Button>
            <span
              aria-hidden="true"
              className="block h-px flex-1"
              style={{ backgroundColor: palette.border }}
            />
            <span
              className="font-mono text-[0.625rem] uppercase tracking-[0.14em]"
              style={{ color: palette['muted-foreground'] }}
            >
              {mode}
            </span>
          </div>
        </div>

        {/* Row 3 — accent swatch strip, edge to edge */}
        <div className="flex h-2.5">
          {theme.accentSwatches.map((swatch, swatchIndex) => (
            <span
              key={`${theme.id}-${swatchIndex}-${swatch}`}
              className="block flex-1"
              style={{ backgroundColor: swatch }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Row 4 — footer with hex codes (mono) */}
        <div
          className="flex h-9 items-center justify-between border-t px-4 font-medium font-mono text-[0.625rem] uppercase tracking-[0.14em]"
          style={{ borderColor: palette.border, color: palette['muted-foreground'] }}
        >
          <span>{theme.accentSwatches[0]}</span>
          <span aria-hidden="true">·</span>
          <span>
            {theme.accentSwatches.length} {theme.accentSwatches.length === 1 ? 'color' : 'colors'}
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Grid of theme cards. Each card is a single themed pane that uses its
 * own palette for background/foreground/border — readers can compare
 * eleven first-party themes side by side.
 *
 * Clicking a card activates that theme site-wide via localStorage + a
 * same-tab CustomEvent the header ThemePicker also listens to, so the
 * rest of the docs follows immediately — no page reload.
 */
export function ThemesGallery() {
  const [activeId, setActiveId] = useState<string>('default');
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setActiveId(readActiveThemeId());
    setMode(readActiveMode());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        setActiveId(event.newValue);
      }
    };
    const onThemeChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setActiveId(event.detail);
      }
    };
    const observer = new MutationObserver(() => setMode(readActiveMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });
    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener(THEME_EVENT, onThemeChange);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener('storage', onStorage);
      globalThis.removeEventListener(THEME_EVENT, onThemeChange);
    };
  }, []);

  const select = (theme: ThemeConfig) => {
    setActiveId(theme.id);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // no-op
    }
    globalThis.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme.id }));
  };

  return (
    <div className="not-prose grid auto-rows-fr grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {BUILT_IN_THEMES.map((theme, index) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          index={index}
          active={theme.id === activeId}
          mode={mode}
          onSelect={select}
        />
      ))}
    </div>
  );
}
