import type { CSSProperties } from 'react';

import { flattenTheme, getRegistryDefaults, renderThemeStyleSheet } from './flatten';
import type { ThemeConfig, ThemeMode } from './types';

const STYLE_TAG_ID = 'clay-theme';
const NOOP = (): void => undefined;

type CssVarMap = Record<`--${string}`, string>;

/**
 * Build a React `style`-prop object containing every CSS variable needed
 * to render `theme` in the given `mode`, fully resolved.
 *
 *   <div style={themeToCssVars(nord, 'dark')}>…</div>
 *
 * The returned object includes:
 *   1. Every registry-default token (so the scope is *complete* and resists
 *      a globally-applied theme leaking through the cascade).
 *   2. The theme's `colors.light` overrides — and, when `mode === 'dark'`,
 *      its `colors.dark` overrides on top.
 *   3. The theme's `geometry`, `borders`, `motion`, `focus`, and per-component
 *      sections.
 *
 * This is the right tool for scoped previews — gallery cards, side-by-side
 * theme comparisons. The wider document still inherits whatever
 * `applyTheme` last injected at `:root`; the scoped subtree pins every
 * Clay token explicitly so it can't drift.
 */
export function themeToCssVars(theme: ThemeConfig, mode: ThemeMode): CSSProperties {
  const defaults = getRegistryDefaults();
  const { rootVars, darkVars } = flattenTheme(theme);

  const merged: CssVarMap = {};
  Object.assign(merged, defaults.light);
  if (mode === 'dark') {
    Object.assign(merged, defaults.dark);
  }
  Object.assign(merged, rootVars);
  if (mode === 'dark') {
    Object.assign(merged, darkVars);
  }
  return merged;
}

/**
 * Apply a theme document-wide by injecting a `<style id="clay-theme">` tag
 * containing both the `:root` block and the dark-mode block.
 *
 * Toggling between light and dark afterwards costs nothing — the dark block
 * activates via the `:is(.dark, [data-mode="dark"])` selector at CSS level,
 * no JS re-run needed. Set `data-mode="dark"` on `<html>` (or add the
 * `dark` class) to switch.
 *
 * Returns a cleanup function that removes the injected tag, restoring the
 * stylesheet defaults.
 *
 * SSR-safe: a no-op cleanup is returned when `document` is undefined. To
 * render the same CSS server-side, call `renderThemeStyleSheet(theme)` and
 * embed the result in a `<style>` tag during HTML generation.
 */
export function applyTheme(theme: ThemeConfig): () => void {
  if (typeof document === 'undefined') {
    return NOOP;
  }
  const css = renderThemeStyleSheet(theme);
  if (css.length === 0) {
    return NOOP;
  }
  const existing = document.getElementById(STYLE_TAG_ID);
  const tag = existing instanceof HTMLStyleElement ? existing : document.createElement('style');
  tag.id = STYLE_TAG_ID;
  tag.textContent = css;
  if (!existing) {
    document.head.appendChild(tag);
  }

  // Effects are toggled via `fx-<name>` classes on `<html>` consumed by
  // the `@utility fx-*` blocks in `@brika/clay/styles`. We strip every
  // `fx-` class first so switching themes guarantees the previous theme's
  // effects don't leak through.
  applyEffectClasses(document.documentElement, theme.effects ?? []);

  return () => {
    tag.remove();
    applyEffectClasses(document.documentElement, []);
  };
}

function applyEffectClasses(root: HTMLElement, effects: readonly string[]): void {
  const stale = Array.from(root.classList).filter((cls) => cls.startsWith('fx-'));
  for (const cls of stale) {
    root.classList.remove(cls);
  }
  for (const name of effects) {
    root.classList.add(`fx-${name}`);
  }
}

/**
 * Remove any injected theme stylesheet from the document. Idempotent.
 *
 * Backwards-compat shim for callers that previously consumed
 * `resetThemeVars(theme)`. The current implementation no longer needs the
 * theme reference (one global tag, one removal), but the parameter is
 * retained for source compatibility.
 */
export function resetThemeVars(_theme?: ThemeConfig): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(STYLE_TAG_ID)?.remove();
  applyEffectClasses(document.documentElement, []);
}
