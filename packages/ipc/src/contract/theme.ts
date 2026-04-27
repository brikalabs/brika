/**
 * Theme Contract
 *
 * Schemas for custom themes and per-user theme selection.
 *
 * `ThemeConfig` is serialised to JSON on the wire and in storage. The shape
 * mirrors the in-memory type the UI builder consumes; schema lives here so
 * hub routes and the UI share one source of truth.
 */

import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

export const THEME_CONFIG_VERSION = 1 as const;

export const CORNER_STYLES = ['round', 'squircle', 'bevel', 'scoop', 'notch'] as const;
export const ELEVATION_STYLES = ['flat', 'soft', 'crisp', 'dramatic'] as const;
export const MOTION_STYLES = ['snappy', 'smooth', 'stately'] as const;
export const COMPONENT_RADIUS_KEYS = [
  'button',
  'card',
  'dialog',
  'popover',
  'tooltip',
  'input',
  'select',
  'menu',
  'menu-item',
  'checkbox',
  'badge',
  'tabs',
  'alert',
  'toast',
  'avatar',
  'switch',
  'switch-thumb',
] as const;

export const CornerStyle = z.enum(CORNER_STYLES);
export type CornerStyle = z.infer<typeof CornerStyle>;

export const ElevationStyle = z.enum(ELEVATION_STYLES);
export type ElevationStyle = z.infer<typeof ElevationStyle>;

export const MotionStyle = z.enum(MOTION_STYLES);
export type MotionStyle = z.infer<typeof MotionStyle>;

export const ComponentRadiusKey = z.enum(COMPONENT_RADIUS_KEYS);
export type ComponentRadiusKey = z.infer<typeof ComponentRadiusKey>;

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const ComponentTokens = z
  .object({
    radius: z.number().optional(),
    corners: CornerStyle.optional(),
  })
  .strict();
export type ComponentTokens = z.infer<typeof ComponentTokens>;

/**
 * Color palette. Required keys are enforced; everything else is free-form
 * so themes can add container/role tokens without schema churn.
 */
export const ThemeColors = z
  .object({
    background: z.string(),
    foreground: z.string(),
    card: z.string(),
    'card-foreground': z.string(),
    popover: z.string(),
    'popover-foreground': z.string(),
    primary: z.string(),
    'primary-foreground': z.string(),
    secondary: z.string(),
    'secondary-foreground': z.string(),
    accent: z.string(),
    'accent-foreground': z.string(),
    muted: z.string(),
    'muted-foreground': z.string(),
    border: z.string(),
    input: z.string(),
    ring: z.string(),
    success: z.string(),
    'success-foreground': z.string(),
    warning: z.string(),
    'warning-foreground': z.string(),
    info: z.string(),
    'info-foreground': z.string(),
    destructive: z.string(),
    'destructive-foreground': z.string(),
    'data-1': z.string(),
    'data-2': z.string(),
    'data-3': z.string(),
    'data-4': z.string(),
    'data-5': z.string(),
    'data-6': z.string(),
    'data-7': z.string(),
    'data-8': z.string(),
  })
  .catchall(z.string());
export type ThemeColors = z.infer<typeof ThemeColors>;

export const StateOpacity = z
  .object({
    hover: z.number().optional(),
    focus: z.number().optional(),
    pressed: z.number().optional(),
    selected: z.number().optional(),
    disabled: z.number().optional(),
  })
  .strict();

export const ThemeConfig = z.object({
  version: z.literal(THEME_CONFIG_VERSION),
  id: z.string(),
  name: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  radius: z.number(),
  corners: CornerStyle.optional(),
  spacing: z.number().optional(),
  borderWidth: z.number().optional(),
  elevation: ElevationStyle.optional(),
  elevationTint: z.boolean().optional(),
  backdropBlur: z.number().optional(),
  ringWidth: z.number().optional(),
  ringOffset: z.number().optional(),
  motion: MotionStyle.optional(),
  textBase: z.number().optional(),
  stateOpacity: StateOpacity.optional(),
  componentTokens: z.record(ComponentRadiusKey, ComponentTokens).optional(),
  /** @deprecated retained so older exports still load */
  componentRadii: z.record(ComponentRadiusKey, z.number()).optional(),
  fonts: z.object({
    sans: z.string(),
    mono: z.string(),
  }),
  colors: z.object({
    light: ThemeColors,
    dark: ThemeColors,
  }),
});
export type ThemeConfig = z.infer<typeof ThemeConfig>;

export const ColorMode = z.enum(['light', 'dark', 'system']);
export type ColorMode = z.infer<typeof ColorMode>;

/** Per-user theme selection + color mode preference. */
export const ActiveTheme = z.object({
  theme: z.string(),
  mode: ColorMode,
});
export type ActiveTheme = z.infer<typeof ActiveTheme>;

/** PATCH body: either field optional. */
export const ActiveThemeUpdate = z
  .object({
    theme: z.string().optional(),
    mode: ColorMode.optional(),
  })
  .refine((v) => v.theme !== undefined || v.mode !== undefined, {
    message: 'At least one of theme or mode must be provided',
  });
export type ActiveThemeUpdate = z.infer<typeof ActiveThemeUpdate>;
