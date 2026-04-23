/**
 * Effect + motion helpers.
 *
 * We now expose a **semantic** token set alongside the numeric scale:
 *
 *   Elevation (by UI purpose):
 *     surface    — subtle resting shadow for inline content
 *     raised     — cards, buttons, input chips
 *     overlay    — popovers, dropdown menus, tooltips
 *     modal      — dialogs, sheets
 *     spotlight  — toasts, command-palette, notifications
 *
 * The numeric scale (xs…xl) is kept as an internal implementation detail
 * and maps onto the semantic names — consumers should prefer the semantic
 * tokens so component intent is visible in the code.
 */

import type { ElevationStyle, MotionStyle } from './types';

/* ─── Elevation ──────────────────────────────────────────────── */

export interface Elevations {
  /** Subtle resting surface (cards inline on a page, quiet chrome). */
  surface: string;
  /** Resting or hovered cards, buttons, raised chips. */
  raised: string;
  /** Popovers, dropdowns, tooltips — floating above surfaces. */
  overlay: string;
  /** Dialogs, sheets — fully above the app. */
  modal: string;
  /** Toasts, command palettes — highest floating layer. */
  spotlight: string;
}

interface NumericScale {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

const NUMERIC_RECIPES: Record<ElevationStyle, NumericScale> = {
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

/** Semantic elevations for a given profile. */
export function elevationsFor(style: ElevationStyle | undefined): Elevations {
  const scale = NUMERIC_RECIPES[style ?? 'soft'];
  return {
    surface: scale.xs,
    raised: scale.sm,
    overlay: scale.md,
    modal: scale.lg,
    spotlight: scale.xl,
  };
}

/**
 * Numeric scale kept for Tailwind compatibility — `shadow-sm`, `shadow-md`
 * etc. utilities still resolve through this scale. Consumers should prefer
 * `elevationsFor()` when the component has a semantic role.
 */
export function shadowScaleFor(style: ElevationStyle | undefined): NumericScale {
  return NUMERIC_RECIPES[style ?? 'soft'];
}

/* ─── Radius ─────────────────────────────────────────────────── */

export interface Radii {
  /** Badges, tag dots, tight shapes. */
  tight: string;
  /** Chips, pills, outer surfaces of compact controls. */
  pill: string;
  /** Buttons, inputs, switches, form controls. */
  control: string;
  /** Cards, panels, sidebar rails. */
  container: string;
  /** Dialogs, sheets, bottom sheets — widest surface. */
  surface: string;
}

/** Derive the semantic radius set from the base `--radius` scalar (rem). */
export function radiiFor(baseRadius: number): Radii {
  const clamp = (n: number) => Math.max(0, n);
  return {
    tight: `${clamp(baseRadius - 0.625).toFixed(3)}rem`,
    pill: `${clamp(baseRadius - 0.375).toFixed(3)}rem`,
    control: `${clamp(baseRadius - 0.25).toFixed(3)}rem`,
    container: `${baseRadius}rem`,
    surface: `${baseRadius + 0.25}rem`,
  };
}

/* ─── Motion ─────────────────────────────────────────────────── */

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

/**
 * Semantic motion set — three speeds by intent. All derive from the
 * chosen profile, with `standard` matching the user-picked speed.
 *
 *   instant   — UI feedback (hover, focus)
 *   standard  — typical state transitions (menu open, tab switch)
 *   considered — reveals that deserve emphasis (sheet, accordion)
 */
export interface Motions {
  instant: MotionRecipe;
  standard: MotionRecipe;
  considered: MotionRecipe;
}

export function motionsFor(style: MotionStyle | undefined): Motions {
  const standard = motionRecipeFor(style);
  const base = Number.parseFloat(standard.duration); // ms
  const instantMs = Math.max(80, Math.round(base * 0.45));
  const consideredMs = Math.round(base * 1.8);
  return {
    instant: { duration: `${instantMs}ms`, easing: standard.easing },
    standard,
    considered: { duration: `${consideredMs}ms`, easing: standard.easing },
  };
}

/* ─── Tint helper ────────────────────────────────────────────── */

function hexToRgbString(hex: string): string | null {
  const v = hex.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
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
