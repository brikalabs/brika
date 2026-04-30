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

/**
 * Component-scope token keys. Each identifies a component whose tokens
 * can be overridden under `ThemeConfig.componentTokens`. Present keys
 * emit CSS custom properties (`--<key>-radius`, `--<key>-corner-shape`,
 * …); absent keys fall through to the theme-level default via the
 * var-fallback chain in tailwind-theme.css.
 *
 * The name keeps `_RADIUS_` for back-compat; new token kinds are
 * additive under `ComponentTokens` below.
 */
/**
 * Component identifiers the builder can edit. Mirrors clay's Layer-2
 * component-token namespaces exactly, so any clay component automatically
 * becomes editable. The union type is kept for TS narrowing in legacy code
 * paths; new code derives names from clay's TOKEN_REGISTRY at runtime via
 * `clay-tokens.ts`.
 */
export const COMPONENT_RADIUS_KEYS = [
  'alert',
  'avatar',
  'badge',
  'button',
  'card',
  'checkbox',
  'code-block',
  'dialog',
  'icon',
  'input',
  'menu',
  'menu-item',
  'password-input',
  'popover',
  'progress',
  'select',
  'separator',
  'sheet',
  'sidebar',
  'slider',
  'switch',
  'switch-thumb',
  'table',
  'tabs',
  'textarea',
  'toast',
  'tooltip',
] as const;
export type ComponentRadiusKey = (typeof COMPONENT_RADIUS_KEYS)[number];

/**
 * Per-component token overrides — generic map keyed by clay's Layer-2
 * token suffix. e.g. for the `button` component:
 *
 *   {
 *     radius: '0.5rem',
 *     'corner-shape': 'bevel',
 *     shadow: 'var(--shadow-overlay)',
 *     'padding-x': '1rem',
 *     'hover-bg': 'rgba(0,0,0,.05)',
 *   }
 *
 * Values are CSS strings ready to be emitted as `--<component>-<suffix>:
 * <value>`. Numeric inputs (radius, padding, etc.) are formatted with
 * units before being stored.
 */
export type ComponentTokens = Record<string, string | undefined>;

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

  /* Data viz — optional; themes that omit these fall back to CSS defaults */
  'data-1'?: string;
  'data-2'?: string;
  'data-3'?: string;
  'data-4'?: string;
  'data-5'?: string;
  'data-6'?: string;
  'data-7'?: string;
  'data-8'?: string;

  /* Material-inspired additions — all optional. When a preset omits
     these, the CSS layer derives a sensible value via color-mix(). */
  'surface-tint'?: string;
  'surface-dim'?: string;
  'surface-bright'?: string;
  'surface-container-lowest'?: string;
  'surface-container-low'?: string;
  'surface-container'?: string;
  'surface-container-high'?: string;
  'surface-container-highest'?: string;
  'outline-variant'?: string;

  /* Role container pairs — optional overrides. */
  'primary-container'?: string;
  'on-primary-container'?: string;
  'secondary-container'?: string;
  'on-secondary-container'?: string;
  'accent-container'?: string;
  'on-accent-container'?: string;
  'success-container'?: string;
  'on-success-container'?: string;
  'warning-container'?: string;
  'on-warning-container'?: string;
  'info-container'?: string;
  'on-info-container'?: string;
  'destructive-container'?: string;
  'on-destructive-container'?: string;

  /* Component-scope overrides — optional. Let a theme recolor one
     component without moving the system role it defaults to. */
  'button-filled-container'?: string;
  'button-filled-label'?: string;
  'button-outline-border'?: string;
  'button-outline-label'?: string;
  'card-container'?: string;
  'card-label'?: string;
  'dialog-container'?: string;
  'dialog-label'?: string;
  'input-container'?: string;
  'input-label'?: string;
  'input-border'?: string;
  'input-placeholder'?: string;
  icon?: string;
  'icon-muted'?: string;
  'icon-primary'?: string;

  /**
   * Open extension — any other clay color token by full name (e.g.
   * `tooltip-container`, `progress-track-color`). The builder reads
   * clay's TOKEN_REGISTRY at runtime to know which keys are valid.
   */
  [key: string]: string | undefined;
}

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
  /** Base text size in rem (default 1). Scales the whole typography
   *  system — display / headline / title / body / label levels
   *  derive from this via `calc()` in CSS. */
  textBase?: number;
  /** Material-style state-layer opacities, 0..1. The CSS layer uses
   *  these via `--opacity-state-*` (hover / focus / pressed / selected
   *  / disabled). Theme can tune feel without touching per-component
   *  styles. */
  stateOpacity?: {
    hover?: number;
    focus?: number;
    pressed?: number;
    selected?: number;
    disabled?: number;
  };
  /** Per-component token overrides, grouped by component. Each entry
   *  writes `--<key>-<prop>` CSS custom properties consumed by the
   *  component's utilities (`rounded-<key>`, etc.). Absent keys and
   *  absent properties inherit the theme-level defaults. Keys are
   *  clay component names (kebab-case); the builder reads
   *  `COMPONENT_TOKEN_INDEX` from clay-tokens.ts to know which are valid. */
  componentTokens?: Record<string, ComponentTokens>;
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
