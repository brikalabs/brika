import type { CSSProperties } from 'react';
import type { ThemeConfig, ThemeMode } from './types';

type CssVarKey = `--${string}`;

/**
 * Convert a `ThemeConfig` + mode into a React `CSSProperties` object of CSS
 * custom properties ready to spread onto an element's `style` prop.
 *
 *   <div style={themeToCssVars(nord, 'dark')}>…</div>
 *
 * Every token gets written in TWO forms:
 *   --primary             (the bare token used by @theme inline mappings)
 *   --color-primary       (the Tailwind-prefixed token referenced by `bg-primary` etc.)
 *
 * Both are required because Clay's tailwind-theme.css declares
 *   --color-button-filled-container: var(--button-filled-container, var(--primary));
 * — the fallback chain ends at `--primary` (bare), so an override that only
 * touched `--color-primary` would leave optional component-scoped tokens
 * like `--color-button-filled-container` resolving to the default.
 */
export function themeToCssVars(theme: ThemeConfig, mode: ThemeMode): CSSProperties {
  const colors = theme.colors[mode];
  const style: Record<CssVarKey, string> = {};
  for (const [token, value] of Object.entries(colors)) {
    style[`--${token}`] = value;
    style[`--color-${token}`] = value;
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

const NOOP = (): void => undefined;

/**
 * Write a theme's colours onto `document.documentElement` as CSS custom
 * properties. Sets both bare (`--primary`) and prefixed (`--color-primary`)
 * forms so every code path through @theme inline mappings resolves
 * correctly.
 */
export function applyTheme(theme: ThemeConfig, mode: ThemeMode): () => void {
  if (typeof document === 'undefined') {
    return NOOP;
  }
  const root = document.documentElement;
  const colors = theme.colors[mode];
  for (const [token, value] of Object.entries(colors)) {
    root.style.setProperty(`--${token}`, value);
    root.style.setProperty(`--color-${token}`, value);
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
    root.style.removeProperty(`--${token}`);
    root.style.removeProperty(`--color-${token}`);
  }
}
