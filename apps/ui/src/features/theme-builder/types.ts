/**
 * UI-side ThemeConfig types. Thin re-export of the canonical shape from
 * `@brika/ipc/contract` so the wire format and in-memory shape stay aligned.
 *
 * The shape mirrors Clay's `ThemeConfig` — geometry/borders/motion/focus/components
 * are nested sections rather than flat top-level fields. The optional
 * `brika` extension carries UX-preset markers (snappy/smooth, soft/crisp,
 * round/bevel, ...) the builder uses to render its chip-style controls.
 */

export type {
  BrikaThemeMeta,
  ComponentTokens,
  ThemeBorders,
  ThemeColors,
  ThemeFocus,
  ThemeGeometry,
  ThemeMotion,
  TokenMap,
} from '@brika/ipc/contract';

export {
  CORNER_STYLES,
  CornerStyle,
  ELEVATION_STYLES,
  ElevationStyle,
  MOTION_STYLES,
  MotionStyle,
  THEME_CONFIG_VERSION,
  ThemeConfig,
} from '@brika/ipc/contract';
