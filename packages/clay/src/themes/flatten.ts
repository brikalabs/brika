/**
 * Flatten a `ThemeConfig` into two CSS-var dictionaries:
 *
 *   rootVars  — emitted into `:root { ... }` (light defaults).
 *   darkVars  — emitted into the dark-mode selector.
 *
 * Pure function; no DOM access. Used by `applyTheme` to build the
 * injected `<style>` tag and by `themeToCssVars` to build a React style
 * object for scoped overrides.
 *
 * The rules:
 *   - `colors.light.<token>`         → rootVars[--<token>] AND rootVars[--color-<token>]
 *   - `colors.dark.<token>`          → darkVars[--<token>]  AND darkVars[--color-<token>]
 *   - `geometry.<prop>`              → rootVars[--<mapped-name>] (static map)
 *   - `borders.<prop>`               → rootVars[--<mapped-name>]
 *   - `motion.<prop>`                → rootVars[--<mapped-name>]
 *   - `focus.<prop>`                 → rootVars[--<mapped-name>]
 *   - `components.<name>.<prop>`     → rootVars[--<name>-<kebab(prop)>]
 */

import { TOKEN_REGISTRY } from '../tokens/registry';
import type { ThemeConfig } from './types';

export interface FlattenedTheme {
  readonly rootVars: Readonly<Record<string, string>>;
  readonly darkVars: Readonly<Record<string, string>>;
}

/**
 * Static path → CSS-var-name map for the section sub-trees that don't
 * follow a derivable convention. `focus.width` maps to `--ring-width` (not
 * `--focus-width`) because the rendered ring is owned by the existing
 * `--ring-*` tokens — same value, different name. Listed explicitly so
 * the irregularity stays visible.
 */
const SECTION_VAR_MAP: Readonly<Record<string, string>> = {
  'geometry.radius': '--radius',
  'geometry.spacing': '--spacing',
  'geometry.textBase': '--text-base',
  'geometry.fontSans': '--font-sans',
  'geometry.fontMono': '--font-mono',
  'geometry.backdropBlur': '--backdrop-blur',
  'borders.width': '--border-width',
  'borders.style': '--border-style',
  'motion.duration': '--motion-duration',
  'motion.easing': '--motion-easing',
  'focus.width': '--ring-width',
  'focus.offset': '--ring-offset',
};

/**
 * Convert a camelCase identifier to kebab-case. Used for component
 * property names: `outlineLabel` → `outline-label`.
 */
export function camelToKebab(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function writeColorEntries(
  out: Record<string, string>,
  source: Readonly<Record<string, string>> | undefined
): void {
  if (!source) {
    return;
  }
  for (const [name, value] of Object.entries(source)) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    out[`--${name}`] = value;
    out[`--color-${name}`] = value;
  }
}

function writeSectionEntries(
  out: Record<string, string>,
  section: string,
  values: object | undefined
): void {
  if (!values) {
    return;
  }
  for (const [prop, value] of Object.entries(values)) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    const path = `${section}.${prop}`;
    const cssVar = SECTION_VAR_MAP[path];
    if (cssVar) {
      out[cssVar] = value;
    }
  }
}

function writeComponentEntries(
  out: Record<string, string>,
  components: ThemeConfig['components']
): void {
  if (!components) {
    return;
  }
  for (const [componentName, props] of Object.entries(components)) {
    if (!props) {
      continue;
    }
    for (const [prop, value] of Object.entries(props)) {
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }
      out[`--${componentName}-${camelToKebab(prop)}`] = value;
    }
  }
}

/**
 * Walk a theme config and produce the two CSS-var dictionaries that
 * `applyTheme` injects into the document.
 *
 * Empty / missing sections are skipped silently — a theme that only sets
 * `colors.light` produces a `darkVars` empty object and the dark-mode
 * selector is left untouched by `applyTheme`.
 */
export function flattenTheme(theme: ThemeConfig): FlattenedTheme {
  const rootVars: Record<string, string> = {};
  const darkVars: Record<string, string> = {};

  writeColorEntries(rootVars, theme.colors?.light);
  writeColorEntries(darkVars, theme.colors?.dark);

  writeSectionEntries(rootVars, 'geometry', theme.geometry);
  writeSectionEntries(rootVars, 'borders', theme.borders);
  writeSectionEntries(rootVars, 'motion', theme.motion);
  writeSectionEntries(rootVars, 'focus', theme.focus);

  writeComponentEntries(rootVars, theme.components);

  return { rootVars, darkVars };
}

/**
 * Render a flat var dictionary into a `:root { ... }`-style block body.
 * Stable key ordering — alphabetical — so generated `<style>` tags don't
 * thrash on otherwise-identical input.
 */
export function renderVarBlock(vars: Readonly<Record<string, string>>): string {
  const keys = Object.keys(vars).sort((a, b) => a.localeCompare(b));
  return keys.map((key) => `  ${key}: ${vars[key]};`).join('\n');
}

/**
 * Snapshot of every registry token's default value, partitioned by mode.
 * Used by `themeToCssVars` to produce a *fully-resolved* scoped scope —
 * every token gets a value, so descendants of the scoped element never
 * fall through to a globally-applied theme that changed the same token at
 * `:root`. Without this, a per-card theme preview leaks (the gallery
 * card's Button would inherit the globally-applied theme's geometry).
 */
export interface RegistryDefaults {
  readonly light: Readonly<Record<string, string>>;
  readonly dark: Readonly<Record<string, string>>;
}

let cachedDefaults: RegistryDefaults | null = null;

export function getRegistryDefaults(): RegistryDefaults {
  if (cachedDefaults) {
    return cachedDefaults;
  }
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const token of TOKEN_REGISTRY) {
    light[`--${token.name}`] = token.defaultLight;
    if (token.tailwindNamespace === 'color') {
      light[`--color-${token.name}`] = token.defaultLight;
    }
    if (token.defaultDark && token.defaultDark !== token.defaultLight) {
      dark[`--${token.name}`] = token.defaultDark;
      if (token.tailwindNamespace === 'color') {
        dark[`--color-${token.name}`] = token.defaultDark;
      }
    }
  }
  cachedDefaults = { light, dark };
  return cachedDefaults;
}

/**
 * Like `flattenTheme`, but layered on top of every registry default so
 * the result is a *complete* token map per mode.
 *
 * Used to generate per-theme CSS rules (e.g. `[data-theme="ocean"]`) that
 * are leak-resistant: a nested `<ThemeScope>` always reasserts every
 * token, so a globally-applied theme can't bleed in through the cascade
 * via tokens the inner theme didn't explicitly set.
 *
 * `rootVars` covers light + theme.colors.light + every section override.
 * `darkVars` covers dark-mode token deltas + theme.colors.dark.
 */
export function flattenThemeComplete(theme: ThemeConfig): FlattenedTheme {
  const defaults = getRegistryDefaults();
  const themeFlat = flattenTheme(theme);

  return {
    rootVars: { ...defaults.light, ...themeFlat.rootVars },
    darkVars: { ...defaults.dark, ...themeFlat.darkVars },
  };
}

/**
 * Build the CSS that `applyTheme` writes into the injected `<style>` tag.
 * Returns an empty string when the theme contributes no overrides.
 */
export function renderThemeStyleSheet(theme: ThemeConfig): string {
  const { rootVars, darkVars } = flattenTheme(theme);

  const sections: string[] = [];
  if (Object.keys(rootVars).length > 0) {
    sections.push(`:root {\n${renderVarBlock(rootVars)}\n}`);
  }
  if (Object.keys(darkVars).length > 0) {
    sections.push(`:is(.dark, [data-mode="dark"]):root {\n${renderVarBlock(darkVars)}\n}`);
  }
  return sections.join('\n\n');
}
