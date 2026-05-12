/**
 * Theme Contract
 *
 * Schemas for custom themes and per-user theme selection. ThemeConfig
 * mirrors Clay's `ThemeConfig` shape so themes round-trip cleanly with
 * `@brika/clay/themes`. Brika metadata (id, timestamps, UX-preset markers)
 * rides alongside under the `brika` extension and a few top-level fields.
 */

import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

export const THEME_CONFIG_VERSION = 1 as const;

export const CORNER_STYLES = ['round', 'squircle', 'bevel', 'scoop', 'notch'] as const;
export const ELEVATION_STYLES = ['flat', 'soft', 'crisp', 'dramatic'] as const;
export const MOTION_STYLES = ['snappy', 'smooth', 'stately'] as const;

export const CornerStyle = z.enum(CORNER_STYLES);
export type CornerStyle = z.infer<typeof CornerStyle>;

export const ElevationStyle = z.enum(ELEVATION_STYLES);
export type ElevationStyle = z.infer<typeof ElevationStyle>;

export const MotionStyle = z.enum(MOTION_STYLES);
export type MotionStyle = z.infer<typeof MotionStyle>;

// ─── Schemas ─────────────────────────────────────────────────────────────────

/** Open-ended token map. Mirrors Clay's `TokenMap`. */
const TokenMap = z.record(z.string(), z.string());
export type TokenMap = z.infer<typeof TokenMap>;

const ThemeColors = z.object({
  light: TokenMap.optional(),
  dark: TokenMap.optional(),
});
export type ThemeColors = z.infer<typeof ThemeColors>;

const ThemeGeometry = z.object({
  radius: z.string().optional(),
  spacing: z.string().optional(),
  textBase: z.string().optional(),
  fontSans: z.string().optional(),
  fontMono: z.string().optional(),
  backdropBlur: z.string().optional(),
});
export type ThemeGeometry = z.infer<typeof ThemeGeometry>;

const ThemeBorders = z.object({
  width: z.string().optional(),
  style: z.string().optional(),
});
export type ThemeBorders = z.infer<typeof ThemeBorders>;

const ThemeMotion = z.object({
  duration: z.string().optional(),
  easing: z.string().optional(),
});
export type ThemeMotion = z.infer<typeof ThemeMotion>;

const ThemeFocus = z.object({
  width: z.string().optional(),
  offset: z.string().optional(),
});
export type ThemeFocus = z.infer<typeof ThemeFocus>;

/**
 * Per-component override map. Prop keys are camelCase (Clay's walker
 * lowercases them to kebab-case at emit time). Open-ended on both
 * component names and prop names so themes can override anything Clay's
 * registry exposes without schema churn.
 */
const ComponentTokens = z.record(z.string(), z.record(z.string(), z.string()));
export type ComponentTokens = z.infer<typeof ComponentTokens>;

const StateOpacity = z
  .object({
    hover: z.number().optional(),
    focus: z.number().optional(),
    pressed: z.number().optional(),
    selected: z.number().optional(),
    disabled: z.number().optional(),
  })
  .strict();
export type StateOpacity = z.infer<typeof StateOpacity>;

/**
 * Brika-specific extension. Carries UX-preset markers and metadata Clay
 * doesn't model. Clay's `applyTheme` ignores unknown top-level keys, so
 * this travels with the theme without breaking interop.
 */
const BrikaThemeMeta = z
  .object({
    elevation: ElevationStyle.optional(),
    elevationTint: z.boolean().optional(),
    motion: MotionStyle.optional(),
    corners: CornerStyle.optional(),
    stateOpacity: StateOpacity.optional(),
  })
  .strict();
export type BrikaThemeMeta = z.infer<typeof BrikaThemeMeta>;

export const ThemeConfig = z.object({
  version: z.literal(THEME_CONFIG_VERSION),
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  accentSwatches: z.array(z.string()).readonly().default([]),
  author: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  colors: ThemeColors.optional(),
  geometry: ThemeGeometry.optional(),
  borders: ThemeBorders.optional(),
  motion: ThemeMotion.optional(),
  focus: ThemeFocus.optional(),
  components: ComponentTokens.optional(),
  effects: z.array(z.string()).readonly().optional(),
  brika: BrikaThemeMeta.optional(),
});
export type ThemeConfig = z.infer<typeof ThemeConfig>;

// ─── Active theme ────────────────────────────────────────────────────────────

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
