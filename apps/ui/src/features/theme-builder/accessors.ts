/**
 * Accessor helpers — bridge the v2 nested ThemeConfig shape and the
 * flat field UX the builder controls expose. Each pair reads/writes a
 * single conceptual field (radius, font, motion preset...) without making
 * call sites care that the canonical home is `theme.geometry.radius` or
 * `theme.brika.motion`.
 *
 * All setters are pure: they return a new ThemeConfig with the relevant
 * nested section spread+merged.
 */

import { recomputeRecipes } from './recipes';
import type { CornerStyle, ElevationStyle, MotionStyle, ThemeConfig } from './types';

// ─── Number/CSS-string helpers ──────────────────────────────────────────────

function parseNumberish(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Geometry ───────────────────────────────────────────────────────────────

export function getRadius(t: ThemeConfig): number {
  return parseNumberish(t.geometry?.radius, 0.75);
}
export function setRadius(t: ThemeConfig, value: number): ThemeConfig {
  return { ...t, geometry: { ...t.geometry, radius: `${value}rem` } };
}

export function getSpacing(t: ThemeConfig): number | undefined {
  return t.geometry?.spacing ? parseNumberish(t.geometry.spacing, 0.25) : undefined;
}
export function setSpacing(t: ThemeConfig, value: number | undefined): ThemeConfig {
  const geo = { ...t.geometry };
  if (value === undefined) {
    delete geo.spacing;
  } else {
    geo.spacing = `${value}rem`;
  }
  return { ...t, geometry: geo };
}

export function getTextBase(t: ThemeConfig): number | undefined {
  return t.geometry?.textBase ? parseNumberish(t.geometry.textBase, 1) : undefined;
}
export function setTextBase(t: ThemeConfig, value: number | undefined): ThemeConfig {
  const geo = { ...t.geometry };
  if (value === undefined) {
    delete geo.textBase;
  } else {
    geo.textBase = `${value}rem`;
  }
  return { ...t, geometry: geo };
}

export function getBackdropBlur(t: ThemeConfig): number | undefined {
  return t.geometry?.backdropBlur ? parseNumberish(t.geometry.backdropBlur, 8) : undefined;
}
export function setBackdropBlur(t: ThemeConfig, value: number | undefined): ThemeConfig {
  const geo = { ...t.geometry };
  if (value === undefined) {
    delete geo.backdropBlur;
  } else {
    geo.backdropBlur = `${value}px`;
  }
  return { ...t, geometry: geo };
}

// ─── Borders / focus ────────────────────────────────────────────────────────

export function getBorderWidth(t: ThemeConfig): number | undefined {
  return t.borders?.width ? parseNumberish(t.borders.width, 1) : undefined;
}
export function setBorderWidth(t: ThemeConfig, value: number | undefined): ThemeConfig {
  if (value === undefined) {
    const { width: _, ...rest } = t.borders ?? {};
    return { ...t, borders: Object.keys(rest).length > 0 ? rest : undefined };
  }
  return { ...t, borders: { ...t.borders, width: `${value}px` } };
}

export function getRingWidth(t: ThemeConfig): number | undefined {
  return t.focus?.width ? parseNumberish(t.focus.width, 2) : undefined;
}
export function setRingWidth(t: ThemeConfig, value: number | undefined): ThemeConfig {
  const focus = { ...t.focus };
  if (value === undefined) {
    delete focus.width;
  } else {
    focus.width = `${value}px`;
  }
  return { ...t, focus: Object.keys(focus).length > 0 ? focus : undefined };
}

export function getRingOffset(t: ThemeConfig): number | undefined {
  return t.focus?.offset ? parseNumberish(t.focus.offset, 2) : undefined;
}
export function setRingOffset(t: ThemeConfig, value: number | undefined): ThemeConfig {
  const focus = { ...t.focus };
  if (value === undefined) {
    delete focus.offset;
  } else {
    focus.offset = `${value}px`;
  }
  return { ...t, focus: Object.keys(focus).length > 0 ? focus : undefined };
}

// ─── Brika UX presets ───────────────────────────────────────────────────────

function mergeBrika(
  t: ThemeConfig,
  patch: Partial<NonNullable<ThemeConfig['brika']>>
): ThemeConfig {
  const brika = { ...t.brika, ...patch };
  // Drop undefined/empty entries so equality + persistence stay clean.
  for (const k of Object.keys(brika) as (keyof typeof brika)[]) {
    if (brika[k] === undefined) {
      delete brika[k];
    }
  }
  return recomputeRecipes({
    ...t,
    brika: Object.keys(brika).length > 0 ? brika : undefined,
  });
}

export function getMotion(t: ThemeConfig): MotionStyle | undefined {
  return t.brika?.motion;
}
export function setMotion(t: ThemeConfig, value: MotionStyle | undefined): ThemeConfig {
  return mergeBrika(t, { motion: value });
}

export function getElevation(t: ThemeConfig): ElevationStyle | undefined {
  return t.brika?.elevation;
}
export function setElevation(t: ThemeConfig, value: ElevationStyle | undefined): ThemeConfig {
  return mergeBrika(t, { elevation: value });
}

export function getElevationTint(t: ThemeConfig): boolean {
  return t.brika?.elevationTint ?? false;
}
export function setElevationTint(t: ThemeConfig, value: boolean): ThemeConfig {
  return mergeBrika(t, { elevationTint: value });
}

export function getCorners(t: ThemeConfig): CornerStyle | undefined {
  return t.brika?.corners;
}
export function setCorners(t: ThemeConfig, value: CornerStyle | undefined): ThemeConfig {
  return mergeBrika(t, { corners: value });
}
