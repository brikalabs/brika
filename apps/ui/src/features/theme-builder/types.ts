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

/**
 * Corner geometry for surfaces. Maps to the CSS `corner-shape` property
 * where supported, and also surfaces as a `data-corners` attribute so
 * components can adapt if the native property is not honored.
 *
 *   round     — default border-radius behavior
 *   squircle  — iOS-like smooth rounded corner (superellipse)
 *   bevel     — 45° chamfered corner
 *   scoop     — concave arc cut-out
 *   notch     — right-angle step cut
 */
export const CORNER_STYLES = ['round', 'squircle', 'bevel', 'scoop', 'notch'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

/**
 * Elevation profile — controls the shape of the --shadow-* scale.
 *   flat      no shadow, a subtle inset line instead
 *   soft      gentle diffuse shadows (Brika default)
 *   crisp     tighter, higher-contrast shadows
 *   dramatic  deep, high-offset shadows
 */
export const ELEVATION_STYLES = ['flat', 'soft', 'crisp', 'dramatic'] as const;
export type ElevationStyle = (typeof ELEVATION_STYLES)[number];

/**
 * Motion feel — controls transition duration/easing across interactive
 * elements. Snappy feels responsive and direct; stately feels cinematic.
 */
export const MOTION_STYLES = ['snappy', 'smooth', 'stately'] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];

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
  /** Corner geometry — round, squircle, bevel, scoop, or notch */
  corners?: CornerStyle;
  /** Base spacing unit in rem. Tailwind v4 uses 0.25 by default — lower to tighten, higher to breathe. */
  spacing?: number;
  /** Border width in px (applied to `--border-width`) */
  borderWidth?: number;
  /** Elevation profile — drives the `--shadow-*` scale */
  elevation?: ElevationStyle;
  /** Tint shadows with the primary color instead of neutral black */
  elevationTint?: boolean;
  /** Backdrop blur radius in px for frosted surfaces (`--backdrop-blur`) */
  backdropBlur?: number;
  /** Focus ring width in px (`--ring-width`) */
  ringWidth?: number;
  /** Focus ring offset in px (`--ring-offset`) */
  ringOffset?: number;
  /** Motion feel — controls transition duration/easing */
  motion?: MotionStyle;
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
