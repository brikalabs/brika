/**
 * Recipes — turn Brika UX preset names into Clay theme fragments.
 *
 * The builder UI lets users pick semantic options (motion=snappy/smooth/...,
 * elevation=flat/soft/crisp/dramatic, corners=round/squircle/bevel/...).
 * These names get persisted under `theme.brika.{motion,elevation,corners,...}`
 * and the matching Clay tokens are emitted into `motion`, `borders`,
 * `components`, `geometry` so Clay's flattener / applyTheme renders them.
 *
 * Pure functions. No DOM, no React.
 */

import type {
  BrikaThemeMeta,
  ComponentTokens,
  CornerStyle,
  ElevationStyle,
  MotionStyle,
  ThemeConfig,
  ThemeMotion,
} from './types';

// ─── Shadow recipes ─────────────────────────────────────────────────────────

export interface ShadowScale {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

const SHADOW_RECIPES: Record<ElevationStyle, ShadowScale> = {
  flat: {
    xs: '0 0 0 1px rgb(0 0 0 / 0.04)',
    sm: '0 0 0 1px rgb(0 0 0 / 0.06)',
    md: '0 0 0 1px rgb(0 0 0 / 0.08)',
    lg: '0 0 0 1px rgb(0 0 0 / 0.1)',
    xl: '0 0 0 1px rgb(0 0 0 / 0.12)',
  },
  soft: {
    xs: '0 1px 2px rgb(var(--shadow-rgb, 0 0 0) / 0.05)',
    sm: '0 1px 3px rgb(var(--shadow-rgb, 0 0 0) / 0.08), 0 1px 2px rgb(var(--shadow-rgb, 0 0 0) / 0.05)',
    md: '0 4px 10px rgb(var(--shadow-rgb, 0 0 0) / 0.08), 0 1px 3px rgb(var(--shadow-rgb, 0 0 0) / 0.06)',
    lg: '0 10px 24px rgb(var(--shadow-rgb, 0 0 0) / 0.1), 0 4px 8px rgb(var(--shadow-rgb, 0 0 0) / 0.06)',
    xl: '0 22px 44px rgb(var(--shadow-rgb, 0 0 0) / 0.14), 0 8px 16px rgb(var(--shadow-rgb, 0 0 0) / 0.08)',
  },
  crisp: {
    xs: '0 1px 0 rgb(var(--shadow-rgb, 0 0 0) / 0.08)',
    sm: '0 2px 0 rgb(var(--shadow-rgb, 0 0 0) / 0.1), 0 1px 2px rgb(var(--shadow-rgb, 0 0 0) / 0.12)',
    md: '0 3px 0 rgb(var(--shadow-rgb, 0 0 0) / 0.14), 0 3px 6px rgb(var(--shadow-rgb, 0 0 0) / 0.1)',
    lg: '0 6px 0 rgb(var(--shadow-rgb, 0 0 0) / 0.12), 0 8px 16px rgb(var(--shadow-rgb, 0 0 0) / 0.12)',
    xl: '0 10px 0 rgb(var(--shadow-rgb, 0 0 0) / 0.12), 0 18px 32px rgb(var(--shadow-rgb, 0 0 0) / 0.16)',
  },
  dramatic: {
    xs: '0 2px 4px rgb(var(--shadow-rgb, 0 0 0) / 0.12)',
    sm: '0 4px 10px rgb(var(--shadow-rgb, 0 0 0) / 0.18)',
    md: '0 10px 24px rgb(var(--shadow-rgb, 0 0 0) / 0.22), 0 4px 8px rgb(var(--shadow-rgb, 0 0 0) / 0.12)',
    lg: '0 24px 40px rgb(var(--shadow-rgb, 0 0 0) / 0.28), 0 10px 16px rgb(var(--shadow-rgb, 0 0 0) / 0.16)',
    xl: '0 36px 64px rgb(var(--shadow-rgb, 0 0 0) / 0.34), 0 16px 24px rgb(var(--shadow-rgb, 0 0 0) / 0.18)',
  },
};

export function shadowScaleFor(style: ElevationStyle | undefined): ShadowScale {
  return SHADOW_RECIPES[style ?? 'soft'];
}

// ─── Motion recipes ─────────────────────────────────────────────────────────

/** A motion recipe is a guaranteed duration+easing pair (vs ThemeMotion's
 *  both-optional shape — the recipes table always fills both fields). */
export interface MotionRecipe {
  duration: string;
  easing: string;
}

const MOTION_RECIPES: Record<MotionStyle, MotionRecipe> = {
  snappy: { duration: '120ms', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  smooth: { duration: '220ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  stately: { duration: '360ms', easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
};

export function motionRecipeFor(style: MotionStyle | undefined): MotionRecipe {
  return MOTION_RECIPES[style ?? 'smooth'];
}

// ─── Corner helpers ─────────────────────────────────────────────────────────

export function cornerShapeKeyword(style: CornerStyle | undefined): string {
  return style ?? 'round';
}

// ─── Shadow tint ────────────────────────────────────────────────────────────

function hexToRgbString(hex: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  let h = match[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function shadowTintRgb(primary: string): string | null {
  return hexToRgbString(primary);
}

// ─── Brika-extension flattener ──────────────────────────────────────────────

/**
 * Convert Brika's UX-preset metadata into Clay-shape fragments. Caller merges
 * the fragments into the theme so `applyTheme` / `themeToCssVars` see them.
 *
 * Returns `{ motion, components, extras }` where:
 *   - `motion` is the Clay motion section (duration + easing) for the preset.
 *   - `components` adds shadow/elevation overrides at the Brika "surface"
 *     namespace so all Brika components inherit a consistent scale.
 *   - `extras` is a flat map of CSS variables that Clay doesn't model natively
 *     (--shadow-xs..xl, --shadow-rgb, --state-*-opacity). The caller spreads
 *     these onto the stylesheet alongside Clay's emitted vars.
 */
export interface RecipeFragments {
  motion?: ThemeMotion;
  components?: ComponentTokens;
  /** Flat CSS-var dict for tokens Clay's flattener doesn't emit. */
  extras: Record<`--${string}`, string>;
}

const DEFAULT_SHADOW_RGB = '0 0 0';

export function recipesToFragments(
  brika: BrikaThemeMeta | undefined,
  primaryHex: string | undefined
): RecipeFragments {
  const out: RecipeFragments = { extras: {} };
  if (!brika) {
    return out;
  }

  if (brika.motion) {
    out.motion = { ...motionRecipeFor(brika.motion) };
  }

  if (brika.elevation) {
    const scale = shadowScaleFor(brika.elevation);
    out.extras['--shadow-xs'] = scale.xs;
    out.extras['--shadow-sm'] = scale.sm;
    out.extras['--shadow-md'] = scale.md;
    out.extras['--shadow-lg'] = scale.lg;
    out.extras['--shadow-xl'] = scale.xl;
  }

  if (brika.elevationTint && primaryHex) {
    out.extras['--shadow-rgb'] = shadowTintRgb(primaryHex) ?? DEFAULT_SHADOW_RGB;
  } else {
    out.extras['--shadow-rgb'] = DEFAULT_SHADOW_RGB;
  }

  if (brika.stateOpacity) {
    const s = brika.stateOpacity;
    if (s.hover !== undefined) {
      out.extras['--state-hover-opacity'] = String(s.hover);
    }
    if (s.focus !== undefined) {
      out.extras['--state-focus-opacity'] = String(s.focus);
    }
    if (s.pressed !== undefined) {
      out.extras['--state-pressed-opacity'] = String(s.pressed);
    }
    if (s.selected !== undefined) {
      out.extras['--state-selected-opacity'] = String(s.selected);
    }
    if (s.disabled !== undefined) {
      out.extras['--state-disabled-opacity'] = String(s.disabled);
    }
  }

  return out;
}

/**
 * Re-derive the Clay motion section from `brika.motion` so the stored
 * theme stays consistent: changing the UX preset overwrites the duration
 * and easing fields on save.
 */
export function recomputeRecipes(theme: ThemeConfig): ThemeConfig {
  if (!theme.brika?.motion) {
    return theme;
  }
  return { ...theme, motion: { ...motionRecipeFor(theme.brika.motion) } };
}
