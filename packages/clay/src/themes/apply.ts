import type { CSSProperties } from 'react';
import type { ThemeConfig, ThemeMode } from './types';

type CssVarKey = `--${string}`;

/**
 * Convert a `ThemeConfig` + mode into a React `CSSProperties` object of CSS
 * custom properties ready to spread onto an element's `style` prop.
 *
 *   <div style={themeToCssVars(nord, 'dark')}>…</div>
 *
 * Every colour token in the preset becomes `--color-<token>`; `data-*`
 * accent slots also get bare `--data-N` aliases because Clay's Card
 * component references those directly (legacy; will be normalised in a
 * follow-up PR).
 */
export function themeToCssVars(theme: ThemeConfig, mode: ThemeMode): CSSProperties {
  const colors = theme.colors[mode];
  const style: Record<CssVarKey, string> = {};
  for (const [token, value] of Object.entries(colors)) {
    style[`--color-${token}`] = value;
    if (token.startsWith('data-')) {
      style[`--${token}`] = value;
    }
  }
  return style;
}

const TOKEN_NAMES_CACHE: string[] = [];

function collectTokenNames(theme: ThemeConfig): readonly string[] {
  if (TOKEN_NAMES_CACHE.length > 0) {
    return TOKEN_NAMES_CACHE;
  }
  for (const key of Object.keys(theme.colors.light)) {
    TOKEN_NAMES_CACHE.push(key);
  }
  return TOKEN_NAMES_CACHE;
}

/**
 * Write a theme's colours onto `document.documentElement` as CSS custom
 * properties. Use this when you want the theme to apply globally (site
 * chrome + every component), rather than scoping it to a single element
 * via `themeToCssVars`. Returns a `reset` function that removes the
 * properties again — call it when switching themes, or skip it and just
 * call `applyTheme` with the new choice; overwrites are fine.
 */
const NOOP = (): void => undefined;

export function applyTheme(theme: ThemeConfig, mode: ThemeMode): () => void {
  if (typeof document === 'undefined') {
    return NOOP;
  }
  const root = document.documentElement;
  const colors = theme.colors[mode];
  for (const [token, value] of Object.entries(colors)) {
    root.style.setProperty(`--color-${token}`, value);
    if (token.startsWith('data-')) {
      root.style.setProperty(`--${token}`, value);
    }
  }
  return () => resetThemeVars(theme);
}

/**
 * Remove any theme-applied CSS custom properties from
 * `document.documentElement`, falling back to the stylesheet defaults.
 */
export function resetThemeVars(theme: ThemeConfig): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  for (const token of collectTokenNames(theme)) {
    root.style.removeProperty(`--color-${token}`);
    if (token.startsWith('data-')) {
      root.style.removeProperty(`--${token}`);
    }
  }
}
