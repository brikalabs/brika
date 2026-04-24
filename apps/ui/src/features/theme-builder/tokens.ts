/**
 * Token metadata — labels, groups, and default palettes for the
 * theme builder UI. The builder renders controls from TOKEN_GROUPS;
 * the defaults seed a new theme.
 */

import { findPreset } from './load-presets';
import type { ColorToken, ThemeColors, ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

export interface TokenGroup {
  key: string;
  labelKey: string;
  tokens: readonly ColorToken[];
}

/** Rendering order of color groups in the editor panel.
 *  Groups marked `optional` render their tokens dimmed with a hint that
 *  leaving them blank falls back to a CSS-derived default. */
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
  {
    key: 'surface-tonal',
    labelKey: 'themeBuilder:groups.surfaceTonal',
    tokens: [
      'surface-tint',
      'surface-dim',
      'surface-bright',
      'surface-container-lowest',
      'surface-container-low',
      'surface-container',
      'surface-container-high',
      'surface-container-highest',
      'outline-variant',
    ],
  },
  {
    key: 'role-containers',
    labelKey: 'themeBuilder:groups.roleContainers',
    tokens: [
      'primary-container',
      'on-primary-container',
      'secondary-container',
      'on-secondary-container',
      'accent-container',
      'on-accent-container',
      'success-container',
      'on-success-container',
      'warning-container',
      'on-warning-container',
      'info-container',
      'on-info-container',
      'destructive-container',
      'on-destructive-container',
    ],
  },
] as const;

const DEFAULT_PRESET_ID = 'default';

function defaultPalette(mode: 'light' | 'dark'): ThemeColors {
  const preset = findPreset(DEFAULT_PRESET_ID);
  if (!preset) {
    throw new Error(
      `Missing required preset '${DEFAULT_PRESET_ID}.json' - see apps/ui/src/features/theme-builder/presets/`
    );
  }
  return { ...preset.colors[mode] };
}

/** Default light palette - mirrors the built-in `default` theme. */
export const DEFAULT_LIGHT: ThemeColors = defaultPalette('light');

/** Default dark palette - mirrors the built-in `default` theme dark mode. */
export const DEFAULT_DARK: ThemeColors = defaultPalette('dark');

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
