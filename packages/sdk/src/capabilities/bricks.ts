/**
 * Bricks capability specs.
 *
 * Two plugin -> hub capabilities backing the bricks domain:
 *
 *   1. `bricks.registerType` — the plugin announces a brick type to the hub
 *      (id, families, optional min/max grid size, optional per-instance
 *      config schema). Mirrors the legacy `registerBrickType` IPC message.
 *
 *   2. `bricks.pushData` — the plugin streams new data for a brick type so
 *      every mounted instance can re-render. Mirrors the legacy
 *      `pushBrickData` IPC message.
 *
 * NOTE: only the plugin-initiated directions move to the capability registry.
 * The hub -> plugin directions — `brickInstanceAction` (user interaction
 * event for a specific instance) and `updateBrickConfig` (config push to a
 * running instance, no remount) — stay on the legacy IPC contract in
 * `@brika/ipc/contract/bricks` because capabilities only model plugin -> hub
 * calls.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/bricks.ts`;
 * this file defines only the specs (so they can be imported from both sides)
 * and the Ctx augmentation (so plugin types see `ctx.bricks.registerType()`
 * and `ctx.bricks.pushData()`).
 */

import { defineCapability } from '@brika/capabilities';
import { BrickTypeDefinition } from '@brika/ipc/contract';
import { z } from 'zod';

/** Plugin announces a brick type to the hub. */
export const bricksRegisterType = defineCapability(
  {
    id: 'bricks.registerType',
    args: z.object({ brickType: BrickTypeDefinition }),
    result: z.object({}),
    description: 'Register a brick type with the hub',
    permission: {
      name: 'bricks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'layout-grid',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'bricks.registerType handler is not registered. The hub must register a handler before plugin code can call ctx.bricks.registerType().'
    );
  }
);

/** Plugin pushes arbitrary data for a brick type (client-rendered bricks). */
export const bricksPushData = defineCapability(
  {
    id: 'bricks.pushData',
    args: z.object({ brickTypeId: z.string(), data: z.unknown() }),
    result: z.object({}),
    description: 'Push data for a brick type so every mounted instance re-renders',
    permission: {
      name: 'bricks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'layout-grid',
    },
  },
  () => {
    throw new Error(
      'bricks.pushData handler is not registered. The hub must register a handler before plugin code can call ctx.bricks.pushData().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    bricks: {
      /**
       * Register a brick type with the hub.
       *
       * Requires the `bricks` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      registerType(args: {
        brickType: z.infer<typeof BrickTypeDefinition>;
      }): Promise<Record<string, never>>;

      /**
       * Push data for a brick type so every mounted instance re-renders.
       *
       * Requires the `bricks` permission.
       */
      pushData(args: { brickTypeId: string; data: unknown }): Promise<Record<string, never>>;
    };
  }
}
