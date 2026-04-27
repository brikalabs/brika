/**
 * Module-level store for Layer-2 component tokens.
 *
 * Each component's `tokens.ts` calls `registerTokens(...)` at import
 * time, passing one or more `TokenSpec[]` groups (e.g. the arrays
 * returned by `defineComponentTokens` / `controlSurfaceTokens`). The
 * aggregator [`./components.ts`](./components.ts) imports those
 * modules for their side effects, then exposes the accumulated list
 * as `COMPONENT_TOKENS`.
 *
 * Trade-off: ordering depends on import order, and the list is only
 * complete once `./components.ts` has finished evaluating its
 * side-effect imports. Don't read `getRegisteredTokens()` from a
 * module that runs before that.
 */

import type { TokenSpec } from './types';

const registered: TokenSpec[] = [];

export function registerTokens(...groups: readonly (readonly TokenSpec[])[]): void {
  for (const group of groups) {
    for (const spec of group) {
      registered.push(spec);
    }
  }
}

export function getRegisteredTokens(): readonly TokenSpec[] {
  return registered;
}
