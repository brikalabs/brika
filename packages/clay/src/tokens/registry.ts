/**
 * Clay's token registry — single source of truth for every CSS custom
 * property that participates in theming.
 *
 * Three layers, each authored in its own file:
 *   - Layer 0 scalars   → `./scalars.ts`
 *   - Layer 1 roles     → `./roles/*.ts`
 *   - Layer 2 component → co-located `tokens.ts` per component
 *                         (see `./components.ts` for the aggregator and
 *                         `./orphan-components.ts` for blocks whose
 *                         component folder doesn't exist yet)
 *
 * CSS is contributed at compile time by `../tailwind.ts` (the Tailwind
 * v4 plugin) — no generated files, nothing to run.
 */

import { COMPONENT_TOKENS } from './components';
import { inferTokenType } from './infer';
import { ROLES } from './roles';
import { SCALARS } from './scalars';
import type { ResolvedTokenSpec, TokenSpec } from './types';

const RAW_REGISTRY: readonly TokenSpec[] = [...SCALARS, ...ROLES, ...COMPONENT_TOKENS];

/**
 * Full token registry. Every entry has its `type` filled in — either
 * explicitly authored or inferred from the name's suffix (see
 * `./infer.ts`). Downstream code can safely treat `type` as required.
 */
export const TOKEN_REGISTRY: readonly ResolvedTokenSpec[] = RAW_REGISTRY.map((token) => ({
  ...token,
  type: token.type ?? inferTokenType(token.name),
}));

/**
 * O(1) lookup by token name.
 */
export const TOKENS_BY_NAME: Readonly<Record<string, ResolvedTokenSpec>> = Object.fromEntries(
  TOKEN_REGISTRY.map((token) => [token.name, token])
);

/**
 * Filter tokens by their granular value type. Useful when generating
 * theme-editor UI that needs e.g. all radius tokens or all shadow tokens.
 */
export function tokensByType(type: ResolvedTokenSpec['type']): readonly ResolvedTokenSpec[] {
  return TOKEN_REGISTRY.filter((token) => token.type === type);
}
