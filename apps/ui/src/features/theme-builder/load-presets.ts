/**
 * Preset loader.
 *
 * Now a thin re-export over `@brika/clay/themes`. Clay owns the source-of-truth
 * registry of first-party themes; the theme-builder reads from it instead of
 * import.meta.glob-ing its own JSON copies.
 *
 * `default` is pinned first (it's the baseline-reset option); everything
 * else falls through to alphabetical by name.
 */

import { BUILT_IN_THEMES, type ThemeConfig } from '@brika/clay/themes';
import type { CornerStyle, ThemeColors } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  radius?: number;
  corners?: CornerStyle;
  fonts?: { sans?: string; mono?: string };
  colors: { light: ThemeColors; dark: ThemeColors };
  accentSwatches: readonly string[];
}

const REQUIRED_COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  'background',
  'foreground',
  'primary',
  'primary-foreground',
  'card',
  'card-foreground',
  'border',
  'input',
  'ring',
  'destructive',
  'data-1',
  'data-2',
  'data-3',
  'data-4',
  'data-5',
  'data-6',
  'data-7',
  'data-8',
];

function assertThemeColors(
  value: Readonly<Record<string, string>>
): asserts value is Readonly<Record<string, string>> & ThemeColors {
  for (const key of REQUIRED_COLOR_KEYS) {
    if (typeof value[key] !== 'string') {
      throw new TypeError(`[theme-builder] preset missing required color key: ${key}`);
    }
  }
}

function toPreset(theme: ThemeConfig): ThemePreset | null {
  const light = theme.colors?.light;
  const dark = theme.colors?.dark;
  if (!light || !dark) {
    console.warn(`[theme-builder] Skipping Clay preset without light+dark colors: ${theme.id}`);
    return null;
  }
  try {
    assertThemeColors(light);
    assertThemeColors(dark);
  } catch (error) {
    console.warn(`[theme-builder] Skipping invalid Clay preset: ${theme.id}`, error);
    return null;
  }
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    accentSwatches: theme.accentSwatches,
    colors: { light, dark },
  };
}

function sortPresets(presets: readonly ThemePreset[]): ThemePreset[] {
  return [...presets].sort((a, b) => {
    if (a.id === 'default') {
      return -1;
    }
    if (b.id === 'default') {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function loadAll(): ThemePreset[] {
  const valid: ThemePreset[] = [];
  for (const theme of BUILT_IN_THEMES) {
    const preset = toPreset(theme);
    if (preset) {
      valid.push(preset);
    } else {
      console.warn(`[theme-builder] Skipping invalid Clay preset: ${theme.id}`);
    }
  }
  return valid;
}

export const THEME_PRESETS: readonly ThemePreset[] = sortPresets(loadAll());

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
