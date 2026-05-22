/**
 * `defineGrant` is the single helper plugin- and hub-side code uses to
 * declare a grant. The shape it returns is consumed by:
 *   - `GrantRegistry.register` on the hub side (real handler)
 *   - SDK spec re-exports (handler is a placeholder that throws — the SDK
 *     never invokes the handler; it dispatches over IPC).
 *
 * The double-use of the same shape keeps SDK ↔ hub in lock-step: the spec
 * lives in `@brika/sdk/grants/<name>.ts`, the hub-side handler in
 * `apps/hub/src/runtime/plugins/grants/<name>.ts` imports the same spec
 * and binds a real handler via `defineGrant(spec.spec, realHandler)`.
 */

import type { z } from 'zod';
import type { Grant, GrantHandler, GrantSpec } from './types';

export function defineGrant<I extends z.ZodType, O extends z.ZodType, S extends z.ZodType>(
  spec: GrantSpec<I, O, S>,
  handler: GrantHandler<I, O, S>
): Grant<I, O, S> {
  return { spec, handler };
}
