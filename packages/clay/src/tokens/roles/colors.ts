/**
 * Layer 1 — Color roles
 * Themes typically override these. Listed in the order they appear in
 * existing presets to make migration mechanical.
 *
 * Definitions live in [`./colors.data.json`](./colors.data.json) — a
 * tabular `[name, light, dark, description]` array. Holding them in
 * JSON keeps the structurally-repeating scaffold out of TS source so
 * Sonar's CPD doesn't flag every entry as duplication.
 */

import type { TokenSpec } from '../types';
import COLOR_DEFS from './colors.data.json' with { type: 'json' };

/** Convert kebab-case to camelCase for theme paths. */
function camel(name: string): string {
  return name.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toColorRole(entry: string[]): TokenSpec {
  const [name, defaultLight, defaultDark, description] = entry;
  if (!name || !defaultLight || !defaultDark || !description) {
    throw new Error(`[clay] malformed color role entry: ${JSON.stringify(entry)}`);
  }
  return {
    name,
    layer: 'role',
    category: 'color',
    defaultLight,
    defaultDark,
    description,
    themePath: `colors.${camel(name)}`,
    tailwindNamespace: 'color',
  };
}

export const COLOR_ROLES: readonly TokenSpec[] = COLOR_DEFS.map(toColorRole);
