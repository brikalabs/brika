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

/** Default light palette — mirrors the built-in `default` theme. */
export const DEFAULT_LIGHT: ThemeColors = {
  background: '#fcfcfc',
  foreground: '#17181d',
  card: '#ffffff',
  'card-foreground': '#17181d',
  popover: '#ffffff',
  'popover-foreground': '#17181d',

  primary: '#4a63d1',
  'primary-foreground': '#fcfcfc',
  secondary: '#ececef',
  'secondary-foreground': '#17181d',
  accent: '#e3e4e8',
  'accent-foreground': '#17181d',

  muted: '#eeeff2',
  'muted-foreground': '#71747e',

  border: '#e0e1e5',
  input: '#e0e1e5',
  ring: '#4a63d1',

  success: '#35924a',
  'success-foreground': '#fcfcfc',
  warning: '#c78a2b',
  'warning-foreground': '#17181d',
  info: '#2f68c4',
  'info-foreground': '#fcfcfc',
  destructive: '#c4422d',
  'destructive-foreground': '#fcfcfc',

  'data-1': '#4a63d1',
  'data-2': '#d17d2e',
  'data-3': '#35924a',
  'data-4': '#c4422d',
  'data-5': '#8c42c4',
  'data-6': '#c78a2b',
  'data-7': '#2e9fa1',
  'data-8': '#c44289',
};

/** Default dark palette — mirrors the built-in `default` theme dark mode. */
export const DEFAULT_DARK: ThemeColors = {
  background: '#131419',
  foreground: '#f2f3f5',
  card: '#1a1b21',
  'card-foreground': '#f2f3f5',
  popover: '#1a1b21',
  'popover-foreground': '#f2f3f5',

  primary: '#8d9ee8',
  'primary-foreground': '#131419',
  secondary: '#23252c',
  'secondary-foreground': '#f2f3f5',
  accent: '#2a2c34',
  'accent-foreground': '#f2f3f5',

  muted: '#202128',
  'muted-foreground': '#9497a1',

  border: '#2a2c34',
  input: '#2a2c34',
  ring: '#8d9ee8',

  success: '#63c77e',
  'success-foreground': '#131419',
  warning: '#e8b65e',
  'warning-foreground': '#131419',
  info: '#72a5dd',
  'info-foreground': '#131419',
  destructive: '#e06a55',
  'destructive-foreground': '#f2f3f5',

  'data-1': '#8d9ee8',
  'data-2': '#e5a365',
  'data-3': '#63c77e',
  'data-4': '#e06a55',
  'data-5': '#b38ce0',
  'data-6': '#e8b65e',
  'data-7': '#5dc2c4',
  'data-8': '#e074ac',
};

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
