/**
 * Actions capability specs.
 *
 * Plugins announce server-side actions to the hub via `ctx.actions.register({ id })`.
 * The id is the action's manifest-defined identifier (auto-generated at build time
 * from `hash(filePath:exportName)` — see `@brika/sdk/actions`).
 *
 * NOTE: only the *registration* direction is modelled as a capability. The
 * inverse direction — the hub invoking a plugin action — still travels over
 * the existing `callAction` RPC (hub -> plugin), which is not a capability
 * because capabilities flow plugin -> hub.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/actions.ts`;
 * this file defines only the spec (so it can be imported from both sides) and
 * the Ctx augmentation (so plugin types see `ctx.actions.register()`).
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

/** Plugin announces an action handler to the hub. */
export const actionsRegister = defineCapability(
  {
    id: 'actions.register',
    args: z.object({ id: z.string() }),
    result: z.object({}),
    description: 'Register a server-side action handler with the hub',
    permission: {
      name: 'actions',
      scope: z.object({}),
      defaultScope: {},
      icon: 'play',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'actions.register handler is not registered. The hub must register a handler before plugin code can call ctx.actions.register().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    actions: {
      /**
       * Register a server-side action handler with the hub.
       *
       * The id is the action's manifest-defined identifier (auto-injected at
       * build time from `hash(filePath:exportName)`). Plugin code typically
       * never calls this directly — `defineAction()` from `@brika/sdk/actions`
       * does so on the plugin's behalf.
       *
       * Invocation flows the *other* direction: the hub calls the registered
       * action over the `callAction` RPC, which is not a capability because
       * capabilities flow plugin -> hub.
       *
       * Requires the `actions` permission.
       */
      register(args: { id: string }): Promise<Record<string, never>>;
    };
  }
}
