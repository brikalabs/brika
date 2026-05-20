/**
 * Hub-side handlers for the `blocks.*` capabilities.
 *
 * The specs are defined in `@brika/sdk/capabilities/blocks` (so the Ctx
 * type augmentation is visible to plugins). Here we re-define each capability
 * with the same id but bound to the hub's `onBlock`/`onBlockEmit`/`onBlockLog`
 * callbacks — what used to fire from the legacy `registerBlock`/`blockEmit`/
 * `blockLog` IPC handlers in `plugin-process.ts`.
 *
 * The inverse direction — `startBlock`/`stopBlock`/`pushInput` — still rides
 * the legacy IPC channel: capabilities only model plugin-initiated calls.
 */

import { defineCapability } from '@brika/capabilities';
import type { Json } from '@brika/ipc';
import type { BlockDefinitionType } from '@brika/ipc/contract';
import {
  blocksEmit as emitSpec,
  blocksLog as logSpec,
  blocksRegister as registerSpec,
} from '@brika/sdk/capabilities';

export interface BlocksCallbacks {
  onBlock(def: BlockDefinitionType): void;
  onBlockEmit(instanceId: string, port: string, data: Json): void;
  onBlockLog(
    instanceId: string,
    workflowId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string
  ): void;
}

export function buildBlocksCapabilities(cb: BlocksCallbacks) {
  return [
    defineCapability(registerSpec.spec, (_ctx, { block }) => {
      cb.onBlock(block);
      return {};
    }),
    defineCapability(emitSpec.spec, (_ctx, { instanceId, port, data }) => {
      cb.onBlockEmit(instanceId, port, data);
      return {};
    }),
    defineCapability(logSpec.spec, (_ctx, { instanceId, workflowId, level, message }) => {
      cb.onBlockLog(instanceId, workflowId, level, message);
      return {};
    }),
  ];
}
