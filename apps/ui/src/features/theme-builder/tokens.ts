/**
 * Token metadata — labels, groups, and default seed for the theme builder.
 * Controls render from `TOKEN_GROUPS`; `createDefaultThemeConfig` seeds a
 * fresh draft from Clay's `brika` preset (the in-house first-party theme).
 */

import { findPreset } from './load-presets';
import type { ThemeConfig, TokenMap } from './types';
import { THEME_CONFIG_VERSION } from './types';

export interface TokenGroup {
  key: string;
  labelKey: string;
  tokens: readonly string[];
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

const DEFAULT_PRESET_ID = 'brika';

function paletteFromPreset(mode: 'light' | 'dark'): TokenMap {
  const preset = findPreset(DEFAULT_PRESET_ID);
  if (!preset) {
    throw new Error(
      `Missing required preset '${DEFAULT_PRESET_ID}' — check @brika/clay/themes/registry`
    );
  }
  return { ...preset.colors?.[mode] };
}

/** Default light palette — pulled from Clay's `brika` preset. */
export const DEFAULT_LIGHT: TokenMap = paletteFromPreset('light');

/** Default dark palette — pulled from Clay's `brika` preset. */
export const DEFAULT_DARK: TokenMap = paletteFromPreset('dark');

/** Factory: fresh v2 ThemeConfig seeded from the `brika` preset. */
export function createDefaultThemeConfig(overrides?: Partial<ThemeConfig>): ThemeConfig {
  const now = Date.now();
  return {
    version: THEME_CONFIG_VERSION,
    id: overrides?.id ?? `custom-${now.toString(36)}`,
    name: overrides?.name ?? 'Untitled theme',
    description: overrides?.description ?? '',
    accentSwatches: overrides?.accentSwatches ?? [DEFAULT_LIGHT.primary ?? '#4a63d1'],
    author: overrides?.author,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: now,
    colors: overrides?.colors ?? {
      light: { ...DEFAULT_LIGHT },
      dark: { ...DEFAULT_DARK },
    },
    geometry: overrides?.geometry ?? {
      radius: '0.75rem',
      spacing: '0.25rem',
      backdropBlur: '8px',
      fontSans: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
    borders: overrides?.borders ?? { width: '1px' },
    motion: overrides?.motion,
    focus: overrides?.focus ?? { width: '2px', offset: '2px' },
    components: overrides?.components,
    effects: overrides?.effects,
    brika: overrides?.brika ?? {
      elevation: 'soft',
      elevationTint: false,
      motion: 'smooth',
      corners: 'round',
    },
  };
}

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
