/**
 * Per-theme entry. Importing one preset by name pulls only that JSON into
 * your bundle:
 *
 *   import { ocean } from '@brika/clay/themes';
 *
 * For the full ordered list (picker UIs, galleries, build-time pre-render),
 * import from the registry sub-entry instead — it's opt-in so consumers
 * who only need a single theme don't pay for every preset:
 *
 *   import { builtInThemes } from '@brika/clay/themes/registry';
 */

export { applyTheme, resetThemeVars, themeToCssVars } from './apply';
export type { FlattenedTheme } from './flatten';
export {
  flattenTheme,
  flattenThemeComplete,
  getRegistryDefaults,
  renderThemeStyleSheet,
  renderVarBlock,
} from './flatten';
export * from './presets';
export type { ThemeScopeProps } from './ThemeScope';
export { ThemeScope } from './ThemeScope';
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
