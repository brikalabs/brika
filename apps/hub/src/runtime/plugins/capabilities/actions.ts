/**
 * Hub-side handler for the `actions.register` capability.
 *
 * The spec is defined in `@brika/sdk/capabilities/actions` (so the Ctx type
 * augmentation is visible to plugins). Here we re-bind the same spec to the
 * hub's actual action registry callback.
 *
 * Invocation in the opposite direction (hub -> plugin) still rides the
 * existing `callAction` RPC and is intentionally NOT modelled as a capability.
 */

import { defineCapability } from '@brika/capabilities';
import { actionsRegister as spec } from '@brika/sdk/capabilities';

export interface ActionsCallbacks {
  onAction(id: string): void;
}

export function buildActionsCapabilities(cb: ActionsCallbacks) {
  return [
    defineCapability(spec.spec, (_ctx, { id }) => {
      cb.onAction(id);
      return {};
    }),
  ];
}
