/**
 * Theme wire-format migrations.
 *
 * Runs at the boundaries where a theme enters the app (localStorage
 * hydration, file import) and returns a ThemeConfig shaped to the
 * current in-memory contract. Keep migrations pure so they can be
 * reused in tests without side effects.
 *
 * Versions:
 *   v1 — `componentTokens[c].{radius: number, corners: CornerStyle}`,
 *        plus a deprecated top-level `componentRadii` map.
 *   v2 — `componentTokens[c]` is a generic map keyed by clay's token
 *        suffix (e.g. `radius: '0.5rem'`, `'corner-shape': 'bevel'`,
 *        `shadow: 'var(--shadow-overlay)'`, `'padding-x': '1rem'`).
 */

import {
  COMPONENT_RADIUS_KEYS,
  type ComponentRadiusKey,
  type ComponentTokens,
  type ThemeConfig,
} from './types';

/**
 * Fold legacy fields into the canonical shape, idempotently.
 *
 *   - `componentRadii[c]` → `componentTokens[c].radius` (legacy).
 *   - v1 numeric `componentTokens[c].radius` → string `'<n>rem'`.
 *   - v1 `componentTokens[c].corners` → `componentTokens[c]['corner-shape']`.
 *   - bumps `version` to the current `THEME_CONFIG_VERSION`.
 */
export function migrateThemeConfig(theme: ThemeConfig): ThemeConfig {
  const merged = absorbLegacyComponentRadii(theme);
  const upgraded = upgradeComponentTokensToV2(merged);
  return upgraded;
}

function absorbLegacyComponentRadii(theme: ThemeConfig): ThemeConfig {
  const legacy = theme.componentRadii;
  if (!legacy || Object.keys(legacy).length === 0) {
    return theme;
  }
  const componentTokens: Partial<Record<ComponentRadiusKey, ComponentTokens>> = {
    ...theme.componentTokens,
  };
  for (const key of COMPONENT_RADIUS_KEYS) {
    const radius = legacy[key];
    if (typeof radius !== 'number' || !Number.isFinite(radius)) {
      continue;
    }
    componentTokens[key] = { ...componentTokens[key], radius };
  }
  const next: ThemeConfig = { ...theme, componentTokens };
  next.componentRadii = undefined;
  return next;
}

function upgradeComponentTokensToV2(theme: ThemeConfig): ThemeConfig {
  const tokens = theme.componentTokens;
  if (!tokens) {
    return { ...theme, version: 2 };
  }
  const next: Record<string, ComponentTokens> = {};
  for (const [component, entry] of Object.entries(tokens)) {
    if (!entry) {
      continue;
    }
    next[component] = upgradeEntry(entry);
  }
  return {
    ...theme,
    version: 2,
    componentTokens: next as Record<ComponentRadiusKey, ComponentTokens>,
  };
}

function upgradeEntry(entry: ComponentTokens): ComponentTokens {
  const out: ComponentTokens = {};
  for (const [suffix, value] of Object.entries(entry)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    // v1 → v2: numeric radius becomes a string with a `rem` unit.
    if (suffix === 'radius' && typeof value === 'number' && Number.isFinite(value)) {
      out.radius = `${value}rem`;
      continue;
    }
    // v1 → v2: `corners` is renamed to `corner-shape` to match clay's suffix.
    if (suffix === 'corners' && typeof value === 'string') {
      out['corner-shape'] = value;
      continue;
    }
    out[suffix] = value;
  }
  return out;
}
