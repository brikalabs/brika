/**
 * Module-level store for Layer-2 component tokens.
 *
 * Each component's `tokens.ts` calls `registerTokens(...)` at import
 * time. The aggregator [`./components.ts`](./components.ts) imports
 * those modules for their side effects, then exposes the accumulated
 * list as `COMPONENT_TOKENS`.
 *
 * Trade-off: ordering depends on import order, and the list is only
 * complete once `./components.ts` has finished evaluating its
 * side-effect imports. Don't read `getRegisteredTokens()` from a
 * module that runs before that.
 */

import type { TokenSpec } from './types';

const registered: TokenSpec[] = [];

export function registerTokens(tokens: readonly TokenSpec[]): void {
  registered.push(...tokens);
}

export function getRegisteredTokens(): readonly TokenSpec[] {
  return registered;
}
