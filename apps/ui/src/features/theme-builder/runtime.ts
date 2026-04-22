/**
 * Runtime theme injection.
 *
 * A custom theme is applied by emitting a <style> element into <head>
 * that defines the theme's CSS custom properties under a unique selector.
 * Setting `<html data-theme="custom-{id}">` then activates it — the same
 * mechanism the built-in themes use in `index.css`.
 *
 * Keeping one <style> per custom theme (vs a single rotating sheet) lets
 * multiple themes coexist (e.g. for live preview of a theme that isn't
 * currently active).
 */

import type { ColorToken, ThemeColors, ThemeConfig } from './types';

const STYLE_ID_PREFIX = 'brika-theme-';

export function customThemeSelector(id: string): string {
  return `custom-${id}`;
}

function toCssVars(colors: ThemeColors): string {
  const entries = Object.entries(colors) as Array<[ColorToken, string]>;
  return entries.map(([k, v]) => `--${k}: ${v};`).join(' ');
}

function buildStylesheet(theme: ThemeConfig): string {
  const themeName = customThemeSelector(theme.id);
  const { light, dark } = theme.colors;

  return `
[data-theme="${themeName}"] {
  --radius: ${theme.radius}rem;
  --font-sans: ${theme.fonts.sans};
  --font-mono: ${theme.fonts.mono};
  ${toCssVars(light)}
}
.dark[data-theme="${themeName}"] {
  ${toCssVars(dark)}
}
`.trim();
}

/** Inject or replace the <style> element for a theme. */
export function injectCustomTheme(theme: ThemeConfig): void {
  const id = `${STYLE_ID_PREFIX}${theme.id}`;
  const existing = document.getElementById(id);
  const css = buildStylesheet(theme);

  if (existing instanceof HTMLStyleElement) {
    if (existing.textContent !== css) {
      existing.textContent = css;
    }
    return;
  }

  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/** Remove the injected <style> for a theme. */
export function removeCustomTheme(id: string): void {
  document.getElementById(`${STYLE_ID_PREFIX}${id}`)?.remove();
}

/** Inject every theme in the list. Idempotent. */
export function injectAllCustomThemes(themes: ThemeConfig[]): void {
  for (const theme of themes) {
    injectCustomTheme(theme);
  }
}
