/**
 * Runtime theme injection.
 *
 * Emits the custom theme as a scoped <style> block keyed by
 * `[data-theme="custom-{id}"]`. All token groups come from
 * `theme-css.ts` so adding a new token only requires editing one file.
 */

import { cornerShapeKeyword } from './corner-css';
import { collectDarkPaletteOverrides, collectTokens, tokensToCssText } from './theme-css';
import type { ThemeConfig } from './types';

const STYLE_ID_PREFIX = 'brika-theme-';

export function customThemeSelector(id: string): string {
  return `custom-${id}`;
}

function buildStylesheet(theme: ThemeConfig): string {
  const themeName = customThemeSelector(theme.id);
  const shape = cornerShapeKeyword(theme.corners);
  const lightGroups = collectTokens(theme, 'light');
  const darkOverrides = collectDarkPaletteOverrides(theme);

  return `[data-theme="${themeName}"] {
  corner-shape: ${shape};
${tokensToCssText(lightGroups)}}

.dark[data-theme="${themeName}"] {
${tokensToCssText([darkOverrides])}}`;
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
