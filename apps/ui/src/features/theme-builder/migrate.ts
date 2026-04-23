/**
 * Theme wire-format migrations.
 *
 * Runs at the boundaries where a theme enters the app (localStorage
 * hydration, file import) and returns a ThemeConfig shaped to the
 * current in-memory contract. Keep migrations pure so they can be
 * reused in tests without side effects.
 */

import {
  COMPONENT_RADIUS_KEYS,
  type ComponentRadiusKey,
  type ComponentTokens,
  type ThemeConfig,
} from './types';

/**
 * Fold the legacy `componentRadii` field into `componentTokens[key].radius`
 * and drop the legacy field. Idempotent: running this on a migrated
 * theme is a no-op.
 */
export function migrateThemeConfig(theme: ThemeConfig): ThemeConfig {
  const legacy = theme.componentRadii;
  const hasLegacy = legacy !== undefined && Object.keys(legacy).length > 0;
  if (!hasLegacy) {
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
