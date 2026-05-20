/**
 * Hub-side handlers for the `bricks.*` capabilities.
 *
 * The specs are defined in `@brika/sdk/capabilities/bricks` (so the Ctx
 * type augmentation is visible to plugins). Here we re-define each capability
 * with the same id but bound to the hub's callbacks — what used to fire from
 * the legacy `registerBrickType` and `pushBrickData` IPC handlers in
 * `plugin-process.ts`.
 *
 * Only the plugin -> hub directions are capabilities. The reverse directions
 * — `brickInstanceAction` (user interaction event for a specific instance)
 * and `updateBrickConfig` (config push to a running instance) — still ride
 * the legacy IPC contract because capabilities only model plugin-initiated
 * calls.
 */

import { defineCapability } from '@brika/capabilities';
import {
  bricksPushData as pushDataSpec,
  bricksRegisterType as registerTypeSpec,
} from '@brika/sdk/capabilities';
import type { BrickTypeDefinitionType } from '@brika/ipc/contract';

export interface BricksCallbacks {
  onBrickType(def: BrickTypeDefinitionType): void;
  onBrickDataPush(brickTypeId: string, data: unknown): void;
}

export function buildBricksCapabilities(cb: BricksCallbacks) {
  return [
    defineCapability(registerTypeSpec.spec, (_ctx, { brickType }) => {
      cb.onBrickType(brickType);
      return {};
    }),
    defineCapability(pushDataSpec.spec, (_ctx, { brickTypeId, data }) => {
      cb.onBrickDataPush(brickTypeId, data);
      return {};
    }),
  ];
}
