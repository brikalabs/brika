/**
 * Runtime injection of the Brika-extension fragments that Clay's
 * `applyTheme` doesn't emit (shadow scale `--shadow-xs..xl`, state-layer
 * opacities, primary-tinted `--shadow-rgb`).
 *
 * Clay owns `<style id="clay-theme">` — base theme + dark overrides.
 * We own `<style id="brika-recipe-extras">` — a single `:root { ... }`
 * block containing only the Brika-side var extras. Both tags coexist on
 * `:root`; the cascade resolves them deterministically.
 *
 * For custom themes the active draft's recipes are applied; for built-in
 * presets the extras tag is emptied (Clay handles the rest).
 */

import { recipesToFragments } from './recipes';
import type { ThemeConfig } from './types';

const STYLE_ID = 'brika-recipe-extras';

/** Compose the `custom-{id}` external theme name from a stored theme's id. */
export function customThemeSelector(id: string): string {
  return `custom-${id}`;
}

function buildCss(theme: ThemeConfig | null): string {
  if (!theme) {
    return '';
  }
  const { extras } = recipesToFragments(theme.brika, theme.colors?.light?.primary);
  const entries = Object.entries(extras);
  if (entries.length === 0) {
    return '';
  }
  const body = entries.map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `:root {\n${body}\n}`;
}

/**
 * Apply (or clear) the Brika-extension extras for the currently-active theme.
 * Pass `null` when the active theme is a built-in preset without recipes.
 * Idempotent: rewrites the existing `<style>` content rather than re-creating
 * the tag.
 */
export function applyBrikaExtras(theme: ThemeConfig | null): void {
  if (typeof document === 'undefined') {
    return;
  }
  const css = buildCss(theme);
  const existing = document.getElementById(STYLE_ID);

  if (existing instanceof HTMLStyleElement) {
    if (existing.textContent !== css) {
      existing.textContent = css;
    }
    return;
  }

  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

/** Remove the extras tag entirely. */
export function resetBrikaExtras(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(STYLE_ID)?.remove();
}
