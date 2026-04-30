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

import type { ThemeConfig } from '@brika/clay/themes';
import { builtInThemes } from '@brika/clay/themes/registry';
import type { CornerStyle, MotionStyle, ThemeColors } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  accentSwatches: readonly string[];
  colors: { light: ThemeColors; dark: ThemeColors };
  /** Base border-radius in rem */
  radius?: number;
  corners?: CornerStyle;
  /** Base spacing unit in rem */
  spacing?: number;
  /** Base text size in rem */
  textBase?: number;
  /** Border width in px */
  borderWidth?: number;
  /** Backdrop blur in px */
  backdropBlur?: number;
  /** Focus ring width in px */
  ringWidth?: number;
  /** Focus ring offset in px */
  ringOffset?: number;
  motion?: MotionStyle;
  fonts?: { sans?: string; mono?: string };
  componentTokens?: Record<string, Record<string, string>>;
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

/** Convert camelCase to kebab-case ("borderWidth" → "border-width"). */
function camelToKebab(str: string): string {
  return str.replaceAll(/([A-Z])/g, (ch) => `-${ch.toLowerCase()}`);
}

/** Parse a CSS length string (e.g. "0.5rem", "2px") to a plain number. */
function parseLength(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Map a raw CSS duration string to the nearest MotionStyle bucket.
 * Thresholds are the midpoints between each recipe's canonical duration:
 *   snappy=120ms · smooth=220ms · stately=360ms
 */
function guessMotion(duration: string | undefined): MotionStyle | undefined {
  const ms = parseLength(duration);
  if (ms === undefined) {
    return undefined;
  }
  if (ms <= 150) {
    return 'snappy';
  }
  if (ms <= 290) {
    return 'smooth';
  }
  return 'stately';
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

  const geo = theme.geometry;
  const componentTokens = theme.components
    ? Object.fromEntries(
        Object.entries(theme.components).map(([component, tokens]) => [
          component,
          Object.fromEntries(Object.entries(tokens).map(([k, v]) => [camelToKebab(k), v])),
        ])
      )
    : undefined;

  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    accentSwatches: theme.accentSwatches,
    colors: { light, dark },
    radius: parseLength(geo?.radius),
    spacing: parseLength(geo?.spacing),
    textBase: parseLength(geo?.textBase),
    backdropBlur: parseLength(geo?.backdropBlur),
    fonts: geo?.fontSans || geo?.fontMono ? { sans: geo.fontSans, mono: geo.fontMono } : undefined,
    borderWidth: parseLength(theme.borders?.width),
    motion: guessMotion(theme.motion?.duration),
    ringWidth: parseLength(theme.focus?.width),
    ringOffset: parseLength(theme.focus?.offset),
    componentTokens,
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
  for (const theme of builtInThemes) {
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
