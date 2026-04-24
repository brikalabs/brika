/**
 * Field-by-field equality for ThemeConfig. Cheaper than JSON.stringify
 * and avoids allocating two multi-KB strings on every render.
 */

import type { ComponentTokens, ThemeConfig } from './types';

function isEqualPalette(
  a: ThemeConfig['colors']['light'],
  b: ThemeConfig['colors']['light']
): boolean {
  const entriesA = Object.entries(a);
  const entriesB = Object.entries(b);
  if (entriesA.length !== entriesB.length) {
    return false;
  }
  const bMap = new Map(entriesB);
  for (const [key, value] of entriesA) {
    if (bMap.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function isEqualColors(a: ThemeConfig['colors'], b: ThemeConfig['colors']): boolean {
  return isEqualPalette(a.light, b.light) && isEqualPalette(a.dark, b.dark);
}

/** Shallow equality for an optional flat record: `undefined`/empty are equal. */
function isEqualOptionalRecord(
  a: Readonly<Record<string, unknown>> | undefined,
  b: Readonly<Record<string, unknown>> | undefined
): boolean {
  const aKeys = a ? Object.keys(a) : [];
  const bKeys = b ? Object.keys(b) : [];
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const k of aKeys) {
    if (a?.[k] !== b?.[k]) {
      return false;
    }
  }
  return true;
}

/** Per-component tokens compared field-by-field (radius + corners today). */
function isEqualComponentTokens(
  a: ThemeConfig['componentTokens'],
  b: ThemeConfig['componentTokens']
): boolean {
  const aEntries = Object.entries(a ?? {});
  const bEntries = Object.entries(b ?? {});
  if (aEntries.length !== bEntries.length) {
    return false;
  }
  const bMap = new Map<string, ComponentTokens | undefined>(bEntries);
  for (const [key, av] of aEntries) {
    const bv = bMap.get(key);
    if (av?.radius !== bv?.radius) {
      return false;
    }
    if (av?.corners !== bv?.corners) {
      return false;
    }
  }
  return true;
}

export function isEqualTheme(a: ThemeConfig, b: ThemeConfig): boolean {
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.author !== b.author ||
    a.description !== b.description ||
    a.radius !== b.radius ||
    a.corners !== b.corners ||
    a.spacing !== b.spacing ||
    a.borderWidth !== b.borderWidth ||
    a.elevation !== b.elevation ||
    a.elevationTint !== b.elevationTint ||
    a.backdropBlur !== b.backdropBlur ||
    a.ringWidth !== b.ringWidth ||
    a.ringOffset !== b.ringOffset ||
    a.motion !== b.motion ||
    a.textBase !== b.textBase ||
    a.fonts.sans !== b.fonts.sans ||
    a.fonts.mono !== b.fonts.mono
  ) {
    return false;
  }
  if (!isEqualOptionalRecord(a.stateOpacity, b.stateOpacity)) {
    return false;
  }
  if (!isEqualComponentTokens(a.componentTokens, b.componentTokens)) {
    return false;
  }
  return isEqualColors(a.colors, b.colors);
}
