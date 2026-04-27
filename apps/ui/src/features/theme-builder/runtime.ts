/**
 * Runtime theme injection.
 *
 * Emits the custom theme as a scoped <style> block keyed by
 * `[data-theme="custom-{id}"]`. Body comes straight from `themeToVars` —
 * no grouping or formatting logic lives in this hot path.
 */

import { customThemeStorage } from './storage';
import { darkOverrideVars, themeToVars, varsToCssText } from './theme-css';
import type { ThemeConfig } from './types';

const STYLE_ID_PREFIX = 'brika-theme-';

export function customThemeSelector(id: string): string {
  return `custom-${id}`;
}

function buildStylesheet(theme: ThemeConfig): string {
  const selector = customThemeSelector(theme.id);
  const light = varsToCssText(themeToVars(theme, 'light'));
  const dark = varsToCssText(darkOverrideVars(theme));
  return `[data-theme="${selector}"] {\n${light}\n}\n\n.dark[data-theme="${selector}"] {\n${dark}\n}`;
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
export function injectAllCustomThemes(themes: readonly ThemeConfig[]): void {
  for (const theme of themes) {
    injectCustomTheme(theme);
  }
}

/** Inject only the custom theme currently selected. No-op when id is unknown. */
export function injectActiveCustomTheme(id: string): void {
  const theme = customThemeStorage.get(id);
  if (theme) {
    injectCustomTheme(theme);
  }
}
