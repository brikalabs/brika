/**
 * Preset loader.
 *
 * Re-exports Clay's `builtInThemes` ordered registry, surfaced as the
 * presets shown in the theme-builder PresetPicker. Clay's `ThemeConfig`
 * IS our `ThemePreset` shape now that the schema migration aligned them.
 *
 * `brika` is pinned first (the in-house default). Everything else falls
 * through to alphabetical-by-name.
 */

import type { ThemeConfig as ClayPreset } from '@brika/clay/themes';
import { builtInThemes } from '@brika/clay/themes/registry';

export type ThemePreset = ClayPreset;

function sortPresets(presets: readonly ThemePreset[]): ThemePreset[] {
  return [...presets].sort((a, b) => {
    if (a.id === 'brika') {
      return -1;
    }
    if (b.id === 'brika') {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export const THEME_PRESETS: readonly ThemePreset[] = sortPresets(builtInThemes);

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
