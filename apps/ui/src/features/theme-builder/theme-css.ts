/**
 * theme-css — everything that turns a `ThemeConfig` into CSS primitives.
 *
 * Structure:
 *   1. Shadow recipes (elevation profiles)       — qualitative, can't be pure calc()
 *   2. Motion recipes (duration + easing)        — base timing per profile
 *   3. Corner helpers (keyword + clip-path)      — for browsers without corner-shape
 *   4. Shadow tint helper                        — hex → "r g b"
 *   5. Flat emitter (`themeToVars` / `darkOverrideVars` / `varsToCssText`)
 *
 * The emitter is the single hot path: `themeToVars(theme, mode)` returns a
 * flat dict of CSS variables. Runtime injects it, PreviewCanvas spreads it
 * onto the container, import-export formats it as CSS text. No grouping or
 * per-consumer reshaping happens here.
 *
 * Everything that can be pure CSS math lives in
 * `packages/ui-kit/tailwind-theme.css` — semantic radius scale from
 * `--radius`, motion channels from `--motion-duration`, semantic elevation
 * aliases from `--shadow-*`. JS only emits primitives.
 */

import type { CornerStyle, ElevationStyle, MotionStyle, ThemeColors, ThemeConfig } from './types';

/* ─── Shadow recipes ─────────────────────────────────────────── */

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

/* ─── Motion recipes ─────────────────────────────────────────── */

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

/* ─── Corner helpers ─────────────────────────────────────────── */

/** Map our corner-style id to the CSS `corner-shape` keyword. */
export function cornerShapeKeyword(style: CornerStyle | undefined): string {
  switch (style) {
    case 'squircle':
      return 'squircle';
    case 'bevel':
      return 'bevel';
    case 'scoop':
      return 'scoop';
    case 'notch':
      return 'notch';
    default:
      return 'round';
  }
}

/**
 * Return a `clip-path` that approximates the corner style for browsers
 * without native `corner-shape`. Returns null for plain round corners
 * where `border-radius` already does the job.
 */
export function cornerClipPath(style: CornerStyle | undefined, radius: number): string | null {
  if (!style || style === 'round') {
    return null;
  }
  const r = `${Math.max(radius, 0)}rem`;

  if (style === 'bevel') {
    return `polygon(
      ${r} 0,
      calc(100% - ${r}) 0,
      100% ${r},
      100% calc(100% - ${r}),
      calc(100% - ${r}) 100%,
      ${r} 100%,
      0 calc(100% - ${r}),
      0 ${r}
    )`;
  }

  if (style === 'notch') {
    return `polygon(
      ${r} 0,
      100% 0,
      100% calc(100% - ${r}),
      calc(100% - ${r}) calc(100% - ${r}),
      calc(100% - ${r}) 100%,
      0 100%,
      0 ${r},
      ${r} ${r}
    )`;
  }

  // squircle + scoop don't map cleanly to a polygon; leave to native
  // `corner-shape`. `none` keeps older browsers on plain border-radius.
  return 'none';
}

/* ─── Shadow tint ────────────────────────────────────────────── */

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

/* ─── Flat emitter ───────────────────────────────────────────── */

/** Dict of CSS custom properties. Keys are always `--…` for strict assignability. */
export type ThemeVars = Record<`--${string}`, string>;

const DEFAULT_SHADOW_RGB = '0 0 0';

function colorsInto(out: ThemeVars, colors: ThemeColors): void {
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string' && value.length > 0) {
      out[`--${key}`] = value;
    }
  }
}

function tintFor(theme: ThemeConfig, palette: ThemeColors): string {
  if (!theme.elevationTint) {
    return DEFAULT_SHADOW_RGB;
  }
  return shadowTintRgb(palette.primary) ?? DEFAULT_SHADOW_RGB;
}

function stateOpacityInto(out: ThemeVars, theme: ThemeConfig): void {
  const state = theme.stateOpacity;
  if (!state) {
    return;
  }
  if (state.hover !== undefined) {
    out['--state-hover-opacity'] = String(state.hover);
  }
  if (state.focus !== undefined) {
    out['--state-focus-opacity'] = String(state.focus);
  }
  if (state.pressed !== undefined) {
    out['--state-pressed-opacity'] = String(state.pressed);
  }
  if (state.selected !== undefined) {
    out['--state-selected-opacity'] = String(state.selected);
  }
  if (state.disabled !== undefined) {
    out['--state-disabled-opacity'] = String(state.disabled);
  }
}

/**
 * Emit `--<key>-<prop>` variables for every per-component override the
 * theme sets. Today that's `radius` and `corner-shape`; new optional
 * properties on `ComponentTokens` extend this emitter without changing
 * the consumer side of the CSS pipeline.
 */
function componentTokensInto(out: ThemeVars, theme: ThemeConfig): void {
  const tokens = theme.componentTokens;
  if (!tokens) {
    return;
  }
  for (const [key, entry] of Object.entries(tokens)) {
    if (!entry) {
      continue;
    }
    if (typeof entry.radius === 'number' && Number.isFinite(entry.radius)) {
      out[`--${key}-radius`] = `${entry.radius}rem`;
    }
    if (entry.corners) {
      out[`--${key}-corner-shape`] = cornerShapeKeyword(entry.corners);
    }
  }
}

/** Flat dict of every CSS variable a theme writes for the given mode. */
export function themeToVars(theme: ThemeConfig, mode: 'light' | 'dark'): ThemeVars {
  const palette = theme.colors[mode];
  const shadow = shadowScaleFor(theme.elevation);
  const motion = motionRecipeFor(theme.motion);
  const clip = cornerClipPath(theme.corners, theme.radius);

  const vars: ThemeVars = {
    '--radius': `${theme.radius}rem`,
    '--spacing': `${theme.spacing ?? 0.25}rem`,
    '--border-width': `${theme.borderWidth ?? 1}px`,
    '--backdrop-blur': `${theme.backdropBlur ?? 8}px`,
    '--ring-width': `${theme.ringWidth ?? 2}px`,
    '--ring-offset': `${theme.ringOffset ?? 2}px`,
    '--text-base': `${theme.textBase ?? 1}rem`,
    '--motion-duration': motion.duration,
    '--motion-easing': motion.easing,
    '--corner-shape': cornerShapeKeyword(theme.corners),
    '--font-sans': theme.fonts.sans,
    '--font-mono': theme.fonts.mono,
    '--shadow-rgb': tintFor(theme, palette),
    '--shadow-xs': shadow.xs,
    '--shadow-sm': shadow.sm,
    '--shadow-md': shadow.md,
    '--shadow-lg': shadow.lg,
    '--shadow-xl': shadow.xl,
  };
  if (clip) {
    vars['--corner-clip-path'] = clip;
  }
  stateOpacityInto(vars, theme);
  componentTokensInto(vars, theme);
  colorsInto(vars, palette);
  return vars;
}

/** Dark-mode delta: colors + shadow tint only. Everything else is light-invariant. */
export function darkOverrideVars(theme: ThemeConfig): ThemeVars {
  const palette = theme.colors.dark;
  const vars: ThemeVars = { '--shadow-rgb': tintFor(theme, palette) };
  colorsInto(vars, palette);
  return vars;
}

/** Format a flat var dict as the body of a CSS declaration block. */
export function varsToCssText(vars: ThemeVars, indent = '  '): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(vars)) {
    lines.push(`${indent}${name}: ${value};`);
  }
  return lines.join('\n');
}
