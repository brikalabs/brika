/**
 * ThemeConfig — serializable custom theme.
 *
 * Stored in localStorage and exportable as a JSON file. A custom theme
 * supplies values for every token the theme system reads at runtime:
 * colors (light + dark), the radius scalar, and the font families.
 *
 * Colors are stored as CSS color strings (hex works everywhere — the
 * built-in color-mix() calls in oklch still convert hex transparently).
 */

export const THEME_CONFIG_VERSION = 1 as const;

export interface ThemeColors {
  /* Surface */
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;

  /* Brand */
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  accent: string;
  'accent-foreground': string;

  /* Neutral */
  muted: string;
  'muted-foreground': string;

  /* UI elements */
  border: string;
  input: string;
  ring: string;

  /* Feedback */
  success: string;
  'success-foreground': string;
  warning: string;
  'warning-foreground': string;
  info: string;
  'info-foreground': string;
  destructive: string;
  'destructive-foreground': string;

  /* Data viz */
  'data-1': string;
  'data-2': string;
  'data-3': string;
  'data-4': string;
  'data-5': string;
  'data-6': string;
  'data-7': string;
  'data-8': string;
}

export type ColorToken = keyof ThemeColors;

export interface ThemeConfig {
  version: typeof THEME_CONFIG_VERSION;
  /** Slugged id, unique within the user's custom themes */
  id: string;
  /** Display name shown in the theme selector */
  name: string;
  /** Optional author / description */
  author?: string;
  description?: string;
  /** Created / updated timestamps (ms) */
  createdAt: number;
  updatedAt: number;
  /** Base radius in rem for the derived rounded-* scale */
  radius: number;
  /** CSS font-family strings */
  fonts: {
    sans: string;
    mono: string;
  };
  /** Color palette — separate light and dark variants */
  colors: {
    light: ThemeColors;
    dark: ThemeColors;
  };
}
