/**
 * Field-by-field equality for ThemeConfig (v2). Cheaper than JSON.stringify
 * and avoids allocating two multi-KB strings on every render.
 */

import type { ComponentTokens, ThemeConfig, TokenMap } from './types';

function isEqualPalette(a: TokenMap | undefined, b: TokenMap | undefined): boolean {
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) {
    return false;
  }
  for (const k of ak) {
    if (a?.[k] !== b?.[k]) {
      return false;
    }
  }
  return true;
}

function isEqualColors(a: ThemeConfig['colors'], b: ThemeConfig['colors']): boolean {
  return isEqualPalette(a?.light, b?.light) && isEqualPalette(a?.dark, b?.dark);
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

function isEqualComponents(
  a: ComponentTokens | undefined,
  b: ComponentTokens | undefined
): boolean {
  const aEntries = Object.entries(a ?? {});
  const bEntries = Object.entries(b ?? {});
  if (aEntries.length !== bEntries.length) {
    return false;
  }
  const bMap = new Map(bEntries);
  for (const [key, av] of aEntries) {
    if (!isEqualOptionalRecord(av, bMap.get(key))) {
      return false;
    }
  }
  return true;
}

function isEqualSection<T extends Record<string, unknown>>(
  a: T | undefined,
  b: T | undefined
): boolean {
  return isEqualOptionalRecord(a, b);
}

function isEqualBrika(a: ThemeConfig['brika'], b: ThemeConfig['brika']): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (
    a.elevation !== b.elevation ||
    a.elevationTint !== b.elevationTint ||
    a.motion !== b.motion ||
    a.corners !== b.corners
  ) {
    return false;
  }
  return isEqualOptionalRecord(a.stateOpacity, b.stateOpacity);
}

export function isEqualTheme(a: ThemeConfig, b: ThemeConfig): boolean {
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.author !== b.author ||
    a.description !== b.description ||
    a.version !== b.version
  ) {
    return false;
  }
  if (
    !isEqualSection(a.geometry, b.geometry) ||
    !isEqualSection(a.borders, b.borders) ||
    !isEqualSection(a.motion, b.motion) ||
    !isEqualSection(a.focus, b.focus)
  ) {
    return false;
  }
  if (!isEqualBrika(a.brika, b.brika)) {
    return false;
  }
  if (!isEqualComponents(a.components, b.components)) {
    return false;
  }
  return isEqualColors(a.colors, b.colors);
}
