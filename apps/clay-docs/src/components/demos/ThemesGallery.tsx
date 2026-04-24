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

function ThemeCard({
  theme,
  active,
  mode,
  onSelect,
}: {
  readonly theme: ThemeConfig;
  readonly active: boolean;
  readonly mode: ThemeMode;
  readonly onSelect: (theme: ThemeConfig) => void;
}) {
  const scope = themeToCssVars(theme, mode);
  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      aria-pressed={active}
      className={
        active
          ? 'group overflow-hidden rounded-lg border-2 border-clay-brand text-left transition-colors'
          : 'group overflow-hidden rounded-lg border border-clay-hairline text-left transition-colors hover:border-clay-brand'
      }
    >
      <div
        style={{ ...scope, backgroundColor: theme.colors[mode].background }}
        className="flex flex-col gap-3 p-5"
      >
        <div className="flex items-center gap-1 overflow-hidden rounded border border-clay-hairline">
          {theme.accentSwatches.map((swatch, index) => (
            <span
              key={`${theme.id}-${index}`}
              className="block h-3 flex-1"
              style={{ backgroundColor: swatch }}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button>Save changes</Button>
          <Button variant="outline">Cancel</Button>
          <Input placeholder="Type something…" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{theme.name}</CardTitle>
            <CardDescription>Sample card.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{theme.description}</CardContent>
        </Card>
      </div>
      <div className="flex items-center justify-between border-clay-hairline border-t bg-clay-elevated px-4 py-2">
        <span className="font-mono text-clay-default text-xs">{theme.name.toLowerCase()}</span>
        <span className="font-mono text-[0.625rem] text-clay-subtle uppercase tracking-wider">
          {active ? 'active' : 'apply'}
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
    window.addEventListener('storage', onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const select = (theme: ThemeConfig) => {
    setActiveId(theme.id);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // no-op
    }
    // Trigger a full page update so the header picker reads the new value
    // on its next render. The active theme's CSS vars are otherwise set by
    // the ThemePicker, not this gallery — this keeps the two in sync
    // without duplicating apply logic.
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
      {BUILT_IN_THEMES.map((theme) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          active={theme.id === activeId}
          mode={mode}
          onSelect={select}
        />
      ))}
    </div>
  );
}
