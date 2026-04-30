/**
 * Palette presets — quick-start themes the user can seed from.
 *
 * Presets live as JSON in `./presets/` and are loaded via Vite's
 * `import.meta.glob` in [load-presets.ts](./load-presets.ts). This file
 * keeps the `ThemePreset` type and the `createThemeFromPreset()` helper
 * so existing consumers (PresetPicker, builder page) don't need to move.
 *
 * Adding a theme is a file change, not a code change: drop a new JSON
 * file into `./presets/` and it appears in the UI after reload.
 */

import type { ThemePreset } from './load-presets';
import type { ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

export type { ThemePreset } from './load-presets';
export { findPreset, THEME_PRESETS } from './load-presets';

/** Build a fresh ThemeConfig from a preset. Generates new id + timestamps. */
export function createThemeFromPreset(
  preset: ThemePreset,
  name?: string,
  sansFont?: string,
  monoFont?: string
): ThemeConfig {
  const now = Date.now();
  return {
    version: THEME_CONFIG_VERSION,
    id: `custom-${now.toString(36)}`,
    name: name ?? preset.name,
    createdAt: now,
    updatedAt: now,
    radius: preset.radius ?? 0.75,
    corners: preset.corners ?? 'round',
    spacing: preset.spacing,
    textBase: preset.textBase,
    borderWidth: preset.borderWidth,
    backdropBlur: preset.backdropBlur,
    ringWidth: preset.ringWidth,
    ringOffset: preset.ringOffset,
    motion: preset.motion,
    fonts: {
      sans: preset.fonts?.sans ?? sansFont ?? 'Inter, ui-sans-serif, system-ui, sans-serif',
      mono:
        preset.fonts?.mono ??
        monoFont ??
        '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
    colors: {
      light: { ...preset.colors.light },
      dark: { ...preset.colors.dark },
    },
    componentTokens: preset.componentTokens
      ? Object.fromEntries(
          Object.entries(preset.componentTokens).map(([k, v]) => [k, { ...v }])
        )
      : undefined,
  };
}
