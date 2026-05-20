/**
 * Routes capability spec.
 *
 * Plugin-registered HTTP routes have a *bi-directional* lifecycle:
 *
 *   1. REGISTRATION (plugin -> hub):
 *      The plugin declares it owns `method + path`. This is the part that
 *      moves to the capability registry — `ctx.routes.register({ method,
 *      path })` validates the args, checks the grant vector, and emits the
 *      hub-side `onRoute` callback exactly like a normal capability call.
 *
 *   2. INVOCATION (hub -> plugin):
 *      When an HTTP request arrives at `/api/plugins/:uid/routes/<path>`,
 *      the hub forwards it to the plugin via the legacy `routeRequest` RPC
 *      (defined in `@brika/ipc/contract/routes`). That direction stays on
 *      the existing IPC pattern — capabilities only model plugin-initiated
 *      calls, and the per-request handler dispatch is the opposite vector.
 *
 * The handler closure that runs each request still lives in the SDK's
 * `routeRequest` implementation (see `apps/hub/src/runtime/plugins/prelude/
 * routes.ts`). Only the *act of declaring ownership* of a route is a
 * capability.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/routes.ts`;
 * this file defines only the spec (so it can be imported from both sides) and
 * the Ctx augmentation (so plugin types see `ctx.routes.register(...)`).
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

const RouteMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * Declare that the plugin owns the route at `method + path`. The hub records
 * the registration and routes incoming HTTP requests for that pair back to
 * the plugin via the legacy `routeRequest` RPC.
 */
export const routesRegister = defineCapability(
  {
    id: 'dev.brika.routes.register',
    ctxPath: 'routes.register',
    args: z.object({
      method: RouteMethodSchema,
      path: z.string(),
    }),
    result: z.object({}),
    description: "Register an HTTP route the hub serves on the plugin's behalf",
    permission: {
      name: 'routes',
      scope: z.object({}),
      defaultScope: {},
      icon: 'route',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'routes.register handler is not registered. The hub must register a handler before plugin code can call ctx.routes.register().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    routes: {
      /**
       * Declare that the plugin owns `method + path`. The hub forwards
       * matching HTTP requests back via the legacy `routeRequest` RPC; this
       * capability only models the registration side.
       *
       * Requires the `routes` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      register(args: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        path: string;
      }): Promise<Record<string, never>>;
    };
  }
}
