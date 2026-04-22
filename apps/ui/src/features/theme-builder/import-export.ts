/**
 * Theme import / export helpers.
 * Export: serialize the current draft and trigger a file download.
 * Import: parse a JSON file, validate shape, return a new ThemeConfig
 * with a fresh id (so re-importing doesn't overwrite the original).
 */

import { THEME_CONFIG_VERSION, type ThemeColors, type ThemeConfig } from './types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function exportThemeToFile(theme: ThemeConfig): void {
  const blob = new Blob([JSON.stringify(theme, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brika-theme-${slugify(theme.name) || theme.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const REQUIRED_COLOR_TOKENS: readonly (keyof ThemeColors)[] = [
  'background',
  'foreground',
  'primary',
  'card',
  'border',
];

function isThemeColors(v: unknown): v is ThemeColors {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const obj = v as Record<string, unknown>;
  return REQUIRED_COLOR_TOKENS.every((k) => typeof obj[k] === 'string');
}

function isThemeConfig(v: unknown): v is ThemeConfig {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const obj = v as Record<string, unknown>;
  if (obj.version !== THEME_CONFIG_VERSION) {
    return false;
  }
  if (typeof obj.name !== 'string' || typeof obj.radius !== 'number') {
    return false;
  }
  const colors = obj.colors as { light?: unknown; dark?: unknown } | undefined;
  if (!colors || !isThemeColors(colors.light) || !isThemeColors(colors.dark)) {
    return false;
  }
  const fonts = obj.fonts as { sans?: unknown; mono?: unknown } | undefined;
  if (!fonts || typeof fonts.sans !== 'string' || typeof fonts.mono !== 'string') {
    return false;
  }
  return true;
}

export async function importThemeFromFile(file: File): Promise<ThemeConfig> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  if (!isThemeConfig(parsed)) {
    throw new Error(
      'Invalid theme file — expected a Brika ThemeConfig with version, name, radius, fonts, and colors.light/dark.'
    );
  }
  // Rehydrate with a new id + timestamps so re-import doesn't overwrite.
  const now = Date.now();
  return {
    ...parsed,
    id: `custom-${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
  };
}
