import { Button } from '@brika/clay/components/button';
import { Input } from '@brika/clay/components/input';
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
 * One specimen card. Internal layout is a fixed CSS grid (header / title /
 * description / preview / swatches / footer) with rigid row sizes so every
 * card in the gallery aligns regardless of how its description wraps.
 */
function ThemeCard({ theme, index, active, mode, onSelect }: ThemeCardProps) {
  const scope = themeToCssVars(theme, mode);
  const palette = theme.colors[mode];
  const swatchCount = theme.accentSwatches.length;
  const cardClass = active
    ? 'group relative grid w-full grid-rows-[auto_auto_auto_1fr_auto_auto] overflow-hidden rounded-lg border border-clay-strong bg-clay-elevated text-left shadow-sm transition-all'
    : 'group relative grid w-full grid-rows-[auto_auto_auto_1fr_auto_auto] overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated text-left transition-all hover:border-clay-default hover:shadow-sm';

  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      aria-pressed={active}
      className={cardClass}
    >
      {/* Active marker — a hairline-thin vertical accent on the left rail */}
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-clay-strong"
        />
      )}

      {/* Row 1: drafting metadata strip */}
      <div className="flex h-9 items-center gap-2 border-clay-hairline border-b bg-clay-canvas/40 px-3 font-medium font-mono text-[0.625rem] uppercase tracking-[0.12em]">
        <span className="text-clay-strong">{pad(index + 1)}</span>
        <span className="block h-px w-3 bg-clay-hairline" />
        <span className="truncate text-clay-default">{theme.id}</span>
        <span className="block h-px flex-1 bg-clay-hairline" />
        <span
          className={
            active
              ? 'text-clay-strong'
              : 'text-clay-inactive transition-colors group-hover:text-clay-default'
          }
        >
          {active ? 'Active' : 'Apply'}
        </span>
      </div>

      {/* Row 2: serif specimen title — fixed line-height keeps height stable */}
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
        <span
          className="block text-3xl text-clay-strong leading-none"
          style={{ fontFamily: SERIF, fontStyle: 'italic', letterSpacing: '-0.02em' }}
        >
          {theme.name}
        </span>
        <span className="shrink-0 font-mono text-[0.625rem] text-clay-inactive uppercase tracking-[0.12em]">
          {pad(swatchCount)}
        </span>
      </div>

      {/* Row 3: description — always reserves two lines so cards align */}
      <p className="line-clamp-2 min-h-[2lh] px-5 pt-2 pb-4 font-mono text-[0.6875rem] text-clay-subtle leading-snug">
        {theme.description}
      </p>

      {/* Row 4: themed preview — flex column with bottom-aligned controls */}
      <div className="px-5">
        <div
          style={{ ...scope, backgroundColor: palette.background, color: palette.foreground }}
          className="grid h-full grid-rows-[auto_1fr_auto] gap-3 rounded-md border p-4"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="block size-2 rounded-full"
              style={{ backgroundColor: palette.primary }}
            />
            <span
              className="font-mono text-[0.625rem] uppercase tracking-[0.14em]"
              style={{ color: palette['muted-foreground'] }}
            >
              Specimen
            </span>
          </div>
          <p
            className="text-lg leading-[1.15]"
            style={{ fontFamily: SERIF, fontStyle: 'italic', letterSpacing: '-0.018em' }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2">
            <Button size="sm">Save</Button>
            <Button size="sm" variant="outline">
              Cancel
            </Button>
            <Input className="h-8 w-full text-xs" placeholder="Type…" />
          </div>
        </div>
      </div>

      {/* Row 5: swatch strip — fixed height */}
      <div className="mt-4 flex h-7 items-stretch gap-px border-clay-hairline border-t bg-clay-canvas/40 px-1 py-1">
        {theme.accentSwatches.map((swatch, swatchIndex) => (
          <span
            key={`${theme.id}-${swatchIndex}-${swatch}`}
            className="block flex-1 rounded-sm"
            style={{ backgroundColor: swatch }}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Row 6: footer meta */}
      <div className="grid h-9 grid-cols-3 items-center border-clay-hairline border-t px-3 font-medium font-mono text-[0.625rem] uppercase tracking-[0.12em]">
        <span className="justify-self-start text-clay-subtle">{theme.accentSwatches[0]}</span>
        <span className="justify-self-center text-clay-inactive">/</span>
        <span className="justify-self-end text-clay-subtle">{mode}</span>
      </div>
    </button>
  );
}

/**
 * Grid of theme cards. Each card applies its theme to a scoped preview
 * (typographic specimen + Button + Input rendered inside a `<div
 * style={themeToCssVars(...)}>`) so readers can compare themes side-by-side
 * without switching the whole site.
 *
 * Clicking a card activates that theme site-wide via the same localStorage
 * key + custom event the header ThemePicker uses, so the rest of the docs
 * follows immediately — no page reload.
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
    <div className="not-prose grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
