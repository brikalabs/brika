#!/usr/bin/env bun
/**
 * Codegen for the clay-docs lazy-loaded theme stylesheets.
 *
 * Each preset in `BUILT_IN_THEMES` becomes a standalone CSS file under
 * `public/_clay-themes/<id>.css`. The `BaseLayout` inline script inserts
 * a `<link rel="stylesheet">` to the chosen theme synchronously in
 * `<head>`, before first paint. The browser blocks paint until the
 * single small CSS file loads — no FOUC and no payload for themes the
 * user never picks.
 *
 * Run via `predev` and `prebuild` hooks; outputs are gitignored.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILT_IN_THEMES, flattenThemeComplete, renderVarBlock } from '@brika/clay/themes';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const OUT_DIR = join(APP_ROOT, 'public', '_clay-themes');

function renderTheme(theme: (typeof BUILT_IN_THEMES)[number]): string {
  // `Complete` flatten layers the registry defaults under the theme's
  // overrides so the resulting rule reasserts every token. A nested
  // `<ThemeScope data-theme="ocean">` placed under a globally-applied
  // theme then never inherits tokens the global theme set; the inner
  // scope is fully isolated.
  const { rootVars, darkVars } = flattenThemeComplete(theme);
  const sections: string[] = [
    '/**',
    ` * GENERATED FILE — preset: ${theme.id}`,
    ` * Source: packages/clay/src/themes/presets/${theme.id}.json`,
    ' * Run `pnpm --filter @brika/clay-docs build:themes` to regenerate.',
    ' *',
    ` * Lazy-loaded by BaseLayout.astro only when data-theme="${theme.id}"`,
    ' * — no FOUC, no upfront cost.',
    ' */',
    '',
  ];

  if (Object.keys(rootVars).length > 0) {
    sections.push(`[data-theme="${theme.id}"] {\n${renderVarBlock(rootVars)}\n}`);
  }
  if (Object.keys(darkVars).length > 0) {
    sections.push('');
    sections.push(
      `:is(.dark, [data-mode="dark"])[data-theme="${theme.id}"] {\n${renderVarBlock(darkVars)}\n}`
    );
  }
  return sections.join('\n');
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let totalBytes = 0;
for (const theme of BUILT_IN_THEMES) {
  const css = `${renderTheme(theme)}\n`;
  writeFileSync(join(OUT_DIR, `${theme.id}.css`), css, 'utf8');
  totalBytes += css.length;
}

// eslint-disable-next-line no-console
console.log(
  `[build-themes] wrote ${BUILT_IN_THEMES.length} files to public/_clay-themes/ ` +
    `(${(totalBytes / 1024).toFixed(1)} KB total, avg ${Math.round(
      totalBytes / BUILT_IN_THEMES.length
    )} bytes/theme)`
);
