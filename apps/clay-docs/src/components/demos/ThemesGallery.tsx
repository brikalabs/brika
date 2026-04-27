import { Button } from '@brika/clay/components/button';
import type { ThemeConfig, ThemeMode } from '@brika/clay/themes';
import { ThemeScope } from '@brika/clay/themes';
import { builtInThemes } from '@brika/clay/themes/registry';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

// `[data-theme="<id>"]` blocks for every built-in preset are emitted by
// the `@brika/clay/tailwind` plugin (pulled in via `@brika/clay/styles`),
// so the cards below can paint via just `data-theme="<id>"` on their
// `<ThemeScope>` wrappers — no inline-style payload duplicated per card.

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
  return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
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
 * One theme card. The themed inner `<div>` carries the only border (no
 * outer ring chasing a different radius). `ThemeScope` with `asChild`
 * spreads the theme's CSS variables onto that single div without adding
 * a wrapper to the layout tree.
 *
 * Interaction:
 *   - Hover: card lifts (-translate-y-1) and gains an outer halo that
 *     traces the *theme's* radius via box-shadow.
 *   - Active: card stays lifted, halo strengthens, the "Apply" tag in the
 *     header strip flips to a filled "Active" pill with a check.
 *   - Press: brief scale-down for tactile click feedback.
 *
 * Headline auto-fits via `clamp()` on container-query units — long names
 * (Skeuomorph, Brutalist) shrink, short names (Mono) stay large.
 */
function ThemeCard({ theme, index, active, mode, onSelect }: ThemeCardProps) {
  const palette = theme.colors?.[mode] ?? {};

  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      aria-pressed={active}
      data-active={active ? 'true' : undefined}
      className="group/card relative h-full min-w-0 rounded-card text-left outline-none transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-clay-strong focus-visible:ring-offset-2 focus-visible:ring-offset-clay-canvas active:scale-[0.99] active:duration-75 data-[active=true]:-translate-y-1"
      style={{ containerType: 'inline-size' }}
    >
      {/* Default-mode `ThemeScope` (no `asChild`) wraps everything in a
          `display: contents` div, so both the halo span and the themed
          card body inherit the scoped theme via CSS-variable cascade.
          That makes `rounded-card` resolve to the *theme's* radius on
          BOTH elements — sharp on Brutalist/Terminal, plump on Skeuomorph
          — and the halo never out-rounds the card behind it. */}
      <ThemeScope theme={theme} mode={mode}>
        {/* Halo — sits behind the card, traces the same theme radius. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-card opacity-0 shadow-2xl transition-opacity duration-200 group-hover/card:opacity-100 group-data-[active=true]/card:opacity-100"
        />
        <div
          className="relative grid h-full w-full grid-rows-[auto_1fr_auto_auto] gap-0 overflow-hidden rounded-card border text-left transition-[border-color] duration-200 group-hover/card:border-[color-mix(in_oklch,currentColor_25%,transparent)] group-data-[active=true]/card:border-[color-mix(in_oklch,currentColor_45%,transparent)]"
          style={{
            backgroundColor: palette.background,
            color: palette.foreground,
            borderColor: palette.border,
          }}
        >
          {/* Row 1 — drafting strip in theme's muted tone */}
          <div
            className="flex h-9 min-w-0 items-center gap-2 border-b px-4 font-medium font-mono text-[0.625rem] uppercase tracking-[0.14em]"
            style={{ borderColor: palette.border, color: palette['muted-foreground'] }}
          >
            <span className="shrink-0">№ {pad(index + 1)}</span>
            <span
              aria-hidden="true"
              className="block h-px w-3 shrink-0"
              style={{ backgroundColor: palette.border }}
            />
            <span className="min-w-0 truncate">{theme.id}</span>
            <span
              aria-hidden="true"
              className="block h-px flex-1"
              style={{ backgroundColor: palette.border }}
            />
            {active ? (
              <span
                className="-mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
                style={{ backgroundColor: palette.primary, color: palette['primary-foreground'] }}
              >
                <Check size={10} aria-hidden="true" strokeWidth={3} />
                <span>Active</span>
              </span>
            ) : (
              <span
                className="shrink-0 transition-colors group-hover/card:text-(--apply-hover)"
                style={
                  {
                    color: palette['muted-foreground'],
                    '--apply-hover': palette.foreground,
                  } as React.CSSProperties
                }
              >
                Apply
              </span>
            )}
          </div>

          {/* Row 2 — specimen body. Big italic name + description + accent line */}
          <div className="flex min-w-0 flex-col justify-between gap-6 px-6 pt-6 pb-5">
            <div className="min-w-0">
              <h3
                className="block min-w-0 leading-none"
                style={{
                  fontFamily: SERIF,
                  fontStyle: 'italic',
                  letterSpacing: '-0.022em',
                  color: palette.foreground,
                  fontSize: 'clamp(1.75rem, 14cqi, 3rem)',
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
            <div className="flex min-w-0 items-center gap-3">
              <Button size="sm" tabIndex={-1}>
                Sample
              </Button>
              <span
                aria-hidden="true"
                className="block h-px flex-1"
                style={{ backgroundColor: palette.border }}
              />
              <span
                className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.14em]"
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
            className="flex h-9 min-w-0 items-center justify-between gap-2 border-t px-4 font-medium font-mono text-[0.625rem] uppercase tracking-[0.14em]"
            style={{ borderColor: palette.border, color: palette['muted-foreground'] }}
          >
            <span className="min-w-0 truncate">{theme.accentSwatches[0]}</span>
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
            <span className="shrink-0">
              {theme.accentSwatches.length} {theme.accentSwatches.length === 1 ? 'color' : 'colors'}
            </span>
          </div>
        </div>
      </ThemeScope>
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
      {builtInThemes.map((theme, index) => (
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
