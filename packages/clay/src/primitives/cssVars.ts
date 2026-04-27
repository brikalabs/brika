import type { CSSProperties } from 'react';

type CssVarKey = `--${string}`;

/**
 * Build a React `style` object from a map of CSS custom-property names to values.
 *
 * Keys may be supplied with or without the leading `--` — both forms normalise
 * to a single `--name` custom property. Used as the foundation for the
 * `applyTheme` helper landing in PR #3.
 */
export function cssVars(vars: Readonly<Record<string, string | number>>): CSSProperties {
  const style: Record<CssVarKey, string | number> = {};
  for (const [name, value] of Object.entries(vars)) {
    const bare = name.startsWith('--') ? name.slice(2) : name;
    style[`--${bare}`] = value;
  }
  return style;
}
