/**
 * Adapter over `@brika/clay`'s TOKEN_REGISTRY.
 *
 * Groups Layer-2 component tokens by `appliesTo` and by `category` so the
 * builder UI can render every token clay defines for a component without
 * hand-listing them in TS.
 */

import type { ResolvedTokenSpec, TokenCategory } from '@brika/clay/tokens';
import { TOKEN_REGISTRY } from '@brika/clay/tokens';

/** Suffix on a Layer-2 token name (the part after `<component>-`). */
export function tokenSuffix(spec: ResolvedTokenSpec): string {
  if (!spec.appliesTo) {
    return spec.name;
  }
  const prefix = `${spec.appliesTo}-`;
  return spec.name.startsWith(prefix) ? spec.name.slice(prefix.length) : spec.name;
}

/** Index of Layer-2 tokens grouped by component name. */
export const COMPONENT_TOKEN_INDEX: Readonly<Record<string, readonly ResolvedTokenSpec[]>> =
  (() => {
    const map: Record<string, ResolvedTokenSpec[]> = {};
    for (const spec of TOKEN_REGISTRY) {
      if (spec.layer !== 'component' || !spec.appliesTo) {
        continue;
      }
      const list = map[spec.appliesTo] ?? [];
      list.push(spec);
      map[spec.appliesTo] = list;
    }
    return map;
  })();

/** Sorted list of every component name that has at least one Layer-2 token. */
export const COMPONENT_NAMES: readonly string[] = Object.keys(COMPONENT_TOKEN_INDEX).toSorted(
  (a, b) => a.localeCompare(b)
);

/**
 * Tokens for a component, grouped by category. Categories empty for the
 * component are omitted. Tokens within each category preserve registry order.
 */
export function tokensByCategoryFor(
  component: string
): Readonly<Partial<Record<TokenCategory, readonly ResolvedTokenSpec[]>>> {
  const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
  const out: Partial<Record<TokenCategory, ResolvedTokenSpec[]>> = {};
  for (const spec of tokens) {
    const list = out[spec.category] ?? [];
    list.push(spec);
    out[spec.category] = list;
  }
  return out;
}

/** Order categories appear in the UI. Skips those a component doesn't have. */
export const CATEGORY_ORDER: readonly TokenCategory[] = [
  'color',
  'geometry',
  'border',
  'typography',
  'elevation',
  'focus',
  'motion',
  'state',
];
