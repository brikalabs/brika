/**
 * Token metadata — labels, groups, and default palettes for the
 * theme builder UI. The builder renders controls from TOKEN_GROUPS;
 * the defaults seed a new theme.
 */

import type { ColorToken, ThemeColors, ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

export interface TokenGroup {
  key: string;
  labelKey: string;
  tokens: readonly ColorToken[];
}

/** Rendering order of color groups in the editor panel. */
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    key: 'surface',
    labelKey: 'themeBuilder:groups.surface',
    tokens: [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
    ],
  },
  {
    key: 'brand',
    labelKey: 'themeBuilder:groups.brand',
    tokens: [
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'accent',
      'accent-foreground',
    ],
  },
  {
    key: 'neutral',
    labelKey: 'themeBuilder:groups.neutral',
    tokens: ['muted', 'muted-foreground', 'border', 'input', 'ring'],
  },
  {
    key: 'feedback',
    labelKey: 'themeBuilder:groups.feedback',
    tokens: [
      'success',
      'success-foreground',
      'warning',
      'warning-foreground',
      'info',
      'info-foreground',
      'destructive',
      'destructive-foreground',
    ],
  },
  {
    key: 'data',
    labelKey: 'themeBuilder:groups.data',
    tokens: ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6', 'data-7', 'data-8'],
  },
] as const;

/**
 * Positional palette tuple: 33 hex strings in the canonical token order
 * (surface · brand · neutral · feedback · data). See `palette()`.
 */
export type PaletteTuple = readonly [
  // surface (6)
  string,
  string,
  string,
  string,
  string,
  string,
  // brand (6)
  string,
  string,
  string,
  string,
  string,
  string,
  // neutral (5: muted, muted-fg, border, input, ring)
  string,
  string,
  string,
  string,
  string,
  // feedback (8)
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  // data viz (8)
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/**
 * Build a `ThemeColors` from a positional tuple. Keeps palette definitions
 * terse so each preset doesn't repeat every token key.
 */
export function palette(values: PaletteTuple): ThemeColors {
  const [
    background,
    foreground,
    card,
    cardFg,
    popover,
    popoverFg,
    primary,
    primaryFg,
    secondary,
    secondaryFg,
    accent,
    accentFg,
    muted,
    mutedFg,
    border,
    input,
    ring,
    success,
    successFg,
    warning,
    warningFg,
    info,
    infoFg,
    destructive,
    destructiveFg,
    data1,
    data2,
    data3,
    data4,
    data5,
    data6,
    data7,
    data8,
  ] = values;
  return {
    background,
    foreground,
    card,
    'card-foreground': cardFg,
    popover,
    'popover-foreground': popoverFg,
    primary,
    'primary-foreground': primaryFg,
    secondary,
    'secondary-foreground': secondaryFg,
    accent,
    'accent-foreground': accentFg,
    muted,
    'muted-foreground': mutedFg,
    border,
    input,
    ring,
    success,
    'success-foreground': successFg,
    warning,
    'warning-foreground': warningFg,
    info,
    'info-foreground': infoFg,
    destructive,
    'destructive-foreground': destructiveFg,
    'data-1': data1,
    'data-2': data2,
    'data-3': data3,
    'data-4': data4,
    'data-5': data5,
    'data-6': data6,
    'data-7': data7,
    'data-8': data8,
  };
}

/** Default light palette — mirrors the built-in `default` theme. */
export const DEFAULT_LIGHT: ThemeColors = palette([
  '#fcfcfc',
  '#17181d',
  '#ffffff',
  '#17181d',
  '#ffffff',
  '#17181d',
  '#4a63d1',
  '#fcfcfc',
  '#ececef',
  '#17181d',
  '#e3e4e8',
  '#17181d',
  '#eeeff2',
  '#71747e',
  '#e0e1e5',
  '#e0e1e5',
  '#4a63d1',
  '#35924a',
  '#fcfcfc',
  '#c78a2b',
  '#17181d',
  '#2f68c4',
  '#fcfcfc',
  '#c4422d',
  '#fcfcfc',
  '#4a63d1',
  '#d17d2e',
  '#35924a',
  '#c4422d',
  '#8c42c4',
  '#c78a2b',
  '#2e9fa1',
  '#c44289',
]);

/** Default dark palette — mirrors the built-in `default` theme dark mode. */
export const DEFAULT_DARK: ThemeColors = palette([
  '#131419',
  '#f2f3f5',
  '#1a1b21',
  '#f2f3f5',
  '#1a1b21',
  '#f2f3f5',
  '#8d9ee8',
  '#131419',
  '#23252c',
  '#f2f3f5',
  '#2a2c34',
  '#f2f3f5',
  '#202128',
  '#9497a1',
  '#2a2c34',
  '#2a2c34',
  '#8d9ee8',
  '#63c77e',
  '#131419',
  '#e8b65e',
  '#131419',
  '#72a5dd',
  '#131419',
  '#e06a55',
  '#f2f3f5',
  '#8d9ee8',
  '#e5a365',
  '#63c77e',
  '#e06a55',
  '#b38ce0',
  '#e8b65e',
  '#5dc2c4',
  '#e074ac',
]);

/** Factory: a fresh ThemeConfig seeded from the default palette. */
export function createDefaultThemeConfig(overrides?: Partial<ThemeConfig>): ThemeConfig {
  const now = Date.now();
  return {
    version: THEME_CONFIG_VERSION,
    id: overrides?.id ?? `custom-${now.toString(36)}`,
    name: overrides?.name ?? 'Untitled theme',
    author: overrides?.author,
    description: overrides?.description,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: now,
    radius: overrides?.radius ?? 0.75,
    corners: overrides?.corners ?? 'round',
    spacing: overrides?.spacing ?? 0.25,
    borderWidth: overrides?.borderWidth ?? 1,
    elevation: overrides?.elevation ?? 'soft',
    elevationTint: overrides?.elevationTint ?? false,
    backdropBlur: overrides?.backdropBlur ?? 8,
    ringWidth: overrides?.ringWidth ?? 2,
    ringOffset: overrides?.ringOffset ?? 2,
    motion: overrides?.motion ?? 'smooth',
    fonts: overrides?.fonts ?? {
      sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
    colors: overrides?.colors ?? {
      light: { ...DEFAULT_LIGHT },
      dark: { ...DEFAULT_DARK },
    },
  };
}

/** Curated font-family choices surfaced in the font picker. */
export interface FontChoice {
  label: string;
  stack: string;
}

export const SANS_FONT_CHOICES: FontChoice[] = [
  { label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'System', stack: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Geist', stack: '"Geist", ui-sans-serif, system-ui, sans-serif' },
  { label: 'IBM Plex Sans', stack: '"IBM Plex Sans", ui-sans-serif, sans-serif' },
  {
    label: 'Space Grotesk',
    stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  },
  { label: 'Serif', stack: 'ui-serif, Georgia, serif' },
];

export const MONO_FONT_CHOICES: FontChoice[] = [
  {
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
  { label: 'System mono', stack: 'ui-monospace, SFMono-Regular, monospace' },
  { label: 'Fira Code', stack: '"Fira Code", ui-monospace, monospace' },
  { label: 'IBM Plex Mono', stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { label: 'Geist Mono', stack: '"Geist Mono", ui-monospace, monospace' },
];
