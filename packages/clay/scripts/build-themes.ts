#!/usr/bin/env bun
/**
 * Codegen for the all-themes-in-one stylesheet shipped with the package.
 *
 * Produces `src/styles/themes-static.css` with one CSS block per built-in
 * preset, scoped to `[data-theme="<id>"]`. Importing the file (manually
 * via `@brika/clay/styles/themes-static.css`) is what lets `<ThemeScope>`
 * fall back to attribute-only mode — no per-element inline style dump.
 *
 * The companion file is intentionally NOT imported by `clay.css`. Apps
 * that want lazy-loaded themes (e.g. `apps/clay-docs`) ship the file
 * split-per-theme via their own pipeline; apps that want all themes
 * available cheaply import this single file once at startup.
 *
 * Run via `pnpm --filter @brika/clay build:themes`.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILT_IN_THEMES, flattenThemeComplete, renderVarBlock } from '../src/themes';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const OUT_PATH = join(PACKAGE_ROOT, 'src', 'styles', 'themes-static.css');

const HEADER = [
  '/**',
  ' * GENERATED FILE — do not edit by hand.',
  ' * Source: packages/clay/src/themes/presets/*.json + BUILT_IN_THEMES order',
  ' * Run `pnpm --filter @brika/clay build:themes` to regenerate.',
  ' *',
  ' * Optional companion to `@brika/clay/styles`. Import in apps that want',
  ' * built-in themes available cheaply via `data-theme="<id>"` selectors',
  ' * (typically used by `<ThemeScope>` to skip the inline-style payload).',
  ' */',
  '',
].join('\n');

function renderTheme(theme: (typeof BUILT_IN_THEMES)[number]): string {
  // Use the *complete* flatten so the rule re-asserts every registry
  // token, not just the theme's overrides. This is what keeps a nested
  // `<ThemeScope data-theme="ocean">` from inheriting tokens the
  // global theme set on `<html>`.
  const { rootVars, darkVars } = flattenThemeComplete(theme);
  const sections: string[] = [];
  if (Object.keys(rootVars).length > 0) {
    sections.push(`[data-theme="${theme.id}"] {\n${renderVarBlock(rootVars)}\n}`);
  }
  if (Object.keys(darkVars).length > 0) {
    sections.push(
      `:is(.dark, [data-mode="dark"])[data-theme="${theme.id}"] {\n${renderVarBlock(darkVars)}\n}`
    );
  }
  return sections.join('\n\n');
}

const body = BUILT_IN_THEMES.map(renderTheme)
  .filter((s) => s.length > 0)
  .join('\n\n');
const css = `${HEADER}${body}\n`;

writeFileSync(OUT_PATH, css, 'utf8');
// eslint-disable-next-line no-console
console.log(
  `[build-themes] wrote src/styles/themes-static.css (${(css.length / 1024).toFixed(1)} KB, ${BUILT_IN_THEMES.length} themes)`
);
