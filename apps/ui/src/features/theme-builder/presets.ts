/**
 * Quick-start themes a user can seed from. Presets come from Clay's
 * `builtInThemes` (v2 ThemeConfig shape) and wear a Brika metadata jacket
 * (`version`, `createdAt`, `updatedAt`, `id`) when persisted as a custom theme.
 */

import type { ThemePreset } from './load-presets';
import type { ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

export type { ThemePreset } from './load-presets';
export { findPreset, THEME_PRESETS } from './load-presets';

/** Build a fresh ThemeConfig from a Clay preset. Generates new id + timestamps. */
export function createThemeFromPreset(
  preset: ThemePreset,
  name?: string,
  sansFont?: string,
  monoFont?: string
): ThemeConfig {
  const now = Date.now();
  const fontSans =
    preset.geometry?.fontSans ?? sansFont ?? 'Inter, ui-sans-serif, system-ui, sans-serif';
  const fontMono =
    preset.geometry?.fontMono ??
    monoFont ??
    '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
  return {
    version: THEME_CONFIG_VERSION,
    id: `custom-${now.toString(36)}`,
    name: name ?? preset.name,
    description: preset.description ?? '',
    accentSwatches: preset.accentSwatches ?? [],
    createdAt: now,
    updatedAt: now,
    colors: preset.colors
      ? {
          light: preset.colors.light ? { ...preset.colors.light } : undefined,
          dark: preset.colors.dark ? { ...preset.colors.dark } : undefined,
        }
      : undefined,
    geometry: { ...preset.geometry, fontSans, fontMono },
    borders: preset.borders ? { ...preset.borders } : undefined,
    motion: preset.motion ? { ...preset.motion } : undefined,
    focus: preset.focus ? { ...preset.focus } : undefined,
    components: preset.components
      ? Object.fromEntries(Object.entries(preset.components).map(([k, v]) => [k, { ...v }]))
      : undefined,
    effects: preset.effects ? [...preset.effects] : undefined,
  };
}
