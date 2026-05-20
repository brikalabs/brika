/**
 * Hub-side handler for the `routes.register` capability.
 *
 * The spec is defined in `@brika/sdk/capabilities/routes` (so the Ctx
 * type augmentation is visible to plugins). Here we re-define the capability
 * with the same id but bound to the hub's `onRoute` callback — what used to
 * fire from the legacy `registerRoute` IPC message in `plugin-process.ts`.
 *
 * Note: only route REGISTRATION is a capability. Per-request handler
 * INVOCATION still rides the legacy `routeRequest` RPC (hub -> plugin)
 * because capabilities only model plugin-initiated calls.
 */

import { defineCapability } from '@brika/capabilities';
import { routesRegister as registerSpec } from '@brika/sdk/capabilities';

export interface RoutesCallbacks {
  onRoute(method: string, path: string): void;
}

export function buildRoutesCapabilities(cb: RoutesCallbacks) {
  return [
    defineCapability(registerSpec.spec, (_ctx, { method, path }) => {
      cb.onRoute(method, path);
      return {};
    }),
  ];
}
