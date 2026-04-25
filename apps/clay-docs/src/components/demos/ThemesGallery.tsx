import { Button } from '@brika/clay/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@brika/clay/components/card';
import { Input } from '@brika/clay/components/input';
import type { ThemeConfig, ThemeMode } from '@brika/clay/themes';
import { BUILT_IN_THEMES, themeToCssVars } from '@brika/clay/themes';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'clay-theme';
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

function ThemeCard({ theme, index, active, mode, onSelect }: ThemeCardProps) {
  const scope = themeToCssVars(theme, mode);
  const cardClass = active
    ? 'group flex flex-col overflow-hidden rounded-lg border border-clay-strong text-left transition-all'
    : 'group flex flex-col overflow-hidden rounded-lg border border-clay-hairline text-left transition-all hover:border-clay-default';

  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      aria-pressed={active}
      className={cardClass}
    >
      {/* Drafting metadata strip */}
      <div className="flex items-center gap-2 border-clay-hairline border-b bg-clay-canvas/40 px-3 py-2 font-medium font-mono text-[0.625rem] uppercase tracking-[0.12em]">
        <span className="text-clay-strong">{pad(index + 1)}</span>
        <span className="block h-px w-4 bg-clay-hairline" />
        <span className="truncate text-clay-default">{theme.id}</span>
        <span className="block h-px flex-1 bg-clay-hairline" />
        {active ? (
          <span className="text-clay-strong">Active</span>
        ) : (
          <span className="text-clay-inactive transition-colors group-hover:text-clay-default">
            Apply →
          </span>
        )}
      </div>

      {/* Themed preview surface — applies the theme via CSS vars on this subtree only */}
      <div
        style={{ ...scope, backgroundColor: theme.colors[mode].background }}
        className="flex flex-1 flex-col gap-4 p-5"
      >
        <div className="flex h-3 items-stretch overflow-hidden rounded-sm border border-clay-hairline">
          {theme.accentSwatches.map((swatch, swatchIndex) => (
            <span
              key={`${theme.id}-${swatchIndex}-${swatch}`}
              className="block flex-1"
              style={{ backgroundColor: swatch }}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Button>Save changes</Button>
          <div className="flex gap-2">
            <Button variant="outline">Cancel</Button>
            <Input placeholder="Type…" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{theme.name}</CardTitle>
            <CardDescription>Sample card</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{theme.description}</CardContent>
        </Card>
      </div>

      {/* Footer: serif name on the left, hex preview on the right */}
      <div className="flex items-center justify-between gap-3 border-clay-hairline border-t bg-clay-elevated px-4 py-3">
        <span
          className="text-clay-strong text-xl leading-none"
          style={{ fontFamily: SERIF, fontStyle: 'italic', letterSpacing: '-0.02em' }}
        >
          {theme.name}
        </span>
        <span className="font-mono text-[0.625rem] text-clay-inactive uppercase tracking-[0.12em]">
          {mode}
        </span>
      </div>
    </button>
  );
}

/**
 * Grid of theme cards. Each card applies its theme to a scoped preview
 * (Button + Input + Card rendered inside a `<div style={themeToCssVars(...)}>`)
 * so readers can compare themes side-by-side without switching the whole site.
 *
 * Clicking a card activates that theme site-wide via the same localStorage
 * key + custom event the header ThemePicker uses, so the rest of the docs
 * follows.
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
    const observer = new MutationObserver(() => setMode(readActiveMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });
    globalThis.addEventListener('storage', onStorage);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);

  const select = (theme: ThemeConfig) => {
    setActiveId(theme.id);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // no-op
    }
    const url = new URL(window.location.href);
    if (theme.id === 'default') {
      url.searchParams.delete('theme');
    } else {
      url.searchParams.set('theme', theme.id);
    }
    window.location.href = url.toString();
  };

  return (
    <div className="not-prose grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
