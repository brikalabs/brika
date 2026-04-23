/**
 * Preset loader.
 *
 * Reads every `./presets/*.json` file at build time via Vite's
 * `import.meta.glob` (`eager: true`), validates each with a type
 * predicate (no Zod — apps/ui doesn't depend on it), and returns a
 * stable, ordered list.
 *
 * `default` is pinned first (it's the baseline-reset option); everything
 * else falls through to alphabetical by name.
 */

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
  'card',
  'border',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isThemeColors(v: unknown): v is ThemeColors {
  if (!isRecord(v)) {
    return false;
  }
  return REQUIRED_COLOR_KEYS.every((k) => typeof v[k] === 'string');
}

function isPreset(v: unknown): v is ThemePreset {
  if (!isRecord(v)) {
    return false;
  }
  if (typeof v.id !== 'string' || typeof v.name !== 'string') {
    return false;
  }
  if (typeof v.description !== 'string') {
    return false;
  }
  if (!Array.isArray(v.accentSwatches) || !v.accentSwatches.every((s) => typeof s === 'string')) {
    return false;
  }
  if (!isRecord(v.colors)) {
    return false;
  }
  if (!isThemeColors(v.colors.light) || !isThemeColors(v.colors.dark)) {
    return false;
  }
  return true;
}

function loadAll(): ThemePreset[] {
  const modules = import.meta.glob<unknown>('./presets/*.json', {
    eager: true,
    import: 'default',
  });
  const valid: ThemePreset[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    if (isPreset(raw)) {
      valid.push(raw);
    } else {
      console.warn(`[theme-builder] Skipping invalid preset: ${path}`);
    }
  }
  return valid;
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

export const THEME_PRESETS: readonly ThemePreset[] = sortPresets(loadAll());

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
