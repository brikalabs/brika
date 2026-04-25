import brutalist from './presets/brutalist.json' with { type: 'json' };
import candy from './presets/candy.json' with { type: 'json' };
import comic from './presets/comic.json' with { type: 'json' };
import defaultTheme from './presets/default.json' with { type: 'json' };
import dracula from './presets/dracula.json' with { type: 'json' };
import editorial from './presets/editorial.json' with { type: 'json' };
import forest from './presets/forest.json' with { type: 'json' };
import glass from './presets/glass.json' with { type: 'json' };
import lavender from './presets/lavender.json' with { type: 'json' };
import mono from './presets/mono.json' with { type: 'json' };
import nord from './presets/nord.json' with { type: 'json' };
import ocean from './presets/ocean.json' with { type: 'json' };
import ruby from './presets/ruby.json' with { type: 'json' };
import skeuomorph from './presets/skeuomorph.json' with { type: 'json' };
import solarized from './presets/solarized.json' with { type: 'json' };
import sunset from './presets/sunset.json' with { type: 'json' };
import terminal from './presets/terminal.json' with { type: 'json' };
import type { ThemeConfig } from './types';

/**
 * The 17 first-party Clay themes. Ordered by intent: the "default" sits
 * first (Brika classic), then the colour-only palette walk from warm to
 * cool, then the editorial/hacker-aesthetic colour themes (dracula, mono),
 * and finally the six "showcase" themes (brutalist, editorial, terminal,
 * skeuomorph, glass, comic) that demonstrate the full token customization
 * surface — geometry, borders, typography, motion, translucency, and
 * per-component overrides.
 *
 * Named imports (`import { nord } from '@brika/clay/themes'`) are available
 * as re-exports further down.
 */
export const BUILT_IN_THEMES: readonly ThemeConfig[] = [
  defaultTheme,
  ocean,
  forest,
  sunset,
  lavender,
  ruby,
  nord,
  solarized,
  candy,
  dracula,
  mono,
  brutalist,
  editorial,
  terminal,
  skeuomorph,
  glass,
  comic,
];

export const BUILT_IN_THEMES_BY_ID: Readonly<Record<string, ThemeConfig>> = Object.fromEntries(
  BUILT_IN_THEMES.map((theme) => [theme.id, theme])
);

export { applyTheme, resetThemeVars, themeToCssVars } from './apply';
export type { FlattenedTheme } from './flatten';
export {
  flattenTheme,
  flattenThemeComplete,
  getRegistryDefaults,
  renderThemeStyleSheet,
  renderVarBlock,
} from './flatten';
// Named re-exports so consumers can `import { nord } from '@brika/clay/themes'`.
export { default as brutalist } from './presets/brutalist.json' with { type: 'json' };
export { default as candy } from './presets/candy.json' with { type: 'json' };
export { default as comic } from './presets/comic.json' with { type: 'json' };
export { default as default_ } from './presets/default.json' with { type: 'json' };
export { default as dracula } from './presets/dracula.json' with { type: 'json' };
export { default as editorial } from './presets/editorial.json' with { type: 'json' };
export { default as forest } from './presets/forest.json' with { type: 'json' };
export { default as glass } from './presets/glass.json' with { type: 'json' };
export { default as lavender } from './presets/lavender.json' with { type: 'json' };
export { default as mono } from './presets/mono.json' with { type: 'json' };
export { default as nord } from './presets/nord.json' with { type: 'json' };
export { default as ocean } from './presets/ocean.json' with { type: 'json' };
export { default as ruby } from './presets/ruby.json' with { type: 'json' };
export { default as skeuomorph } from './presets/skeuomorph.json' with { type: 'json' };
export { default as solarized } from './presets/solarized.json' with { type: 'json' };
export { default as sunset } from './presets/sunset.json' with { type: 'json' };
export { default as terminal } from './presets/terminal.json' with { type: 'json' };
export { ThemeScope } from './ThemeScope';
export type { ThemeScopeProps } from './ThemeScope';
export type {
  ComponentTokenMap,
  ThemeBorders,
  ThemeColors,
  ThemeConfig,
  ThemeFocus,
  ThemeGeometry,
  ThemeMode,
  ThemeMotion,
  TokenMap,
} from './types';
