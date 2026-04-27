/**
 * Tiny helper for inline CSS custom properties in React style objects.
 *
 * React's `CSSProperties` type doesn't model arbitrary `--*` variables,
 * so there's no type-safe way to set them directly. Concentrating the
 * single necessary type assertion here keeps the rest of the codebase
 * free of scattered casts — callers just do:
 *
 *   <div style={cssVars({ '--radius': '0.75rem' })}>…
 */

import type { CSSProperties } from 'react';

export function cssVars(vars: Record<`--${string}`, string>): CSSProperties {
  return vars as unknown as CSSProperties;
}
